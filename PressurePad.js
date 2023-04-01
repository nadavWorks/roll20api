'use strict';
var ON_PRESS_ATTRIBUTE = "on_press";
var ON_RELEASE_ATTRIBUTE = "on_release";
var ON_CROSS_ATTRIBUTE = "on_cross";
var IGNORE_STATUS_ATTRIBUTE = "ignore_status";
var STATUS_PREFIX = "status_";
var PAD_ID_PLACEHOLDER = /<pad_id_placeholder>/g;
var PAD_NAME_PLACEHOLDER = /<pad_name_placeholder>/g;
var TOKEN_ID_PLACEHOLDER = /<token_id_placeholder>/g;
var PAD_GMNOTES_PLACEHOLDER = /<pad_gmnotes>/g;
var TOKEN_GMNOTES_PLACEHOLDER = /<token_gmnotes>/g;
var PAD_PLACEHOLDER = /<pad_[\w_]+>/ig;
var TOKEN_PLACEHOLDER = /<token_[\w_]+>/g;
var PAD_PREFIX = /<pad_/ig;
var TOKEN_PREFIX = /<token_/ig;
var PLACEHOLDER_SUFFIX = />/ig;


class Pad {
    constructor(characterId, graphic, ignoreStatus) {
        this.characterId = characterId;
        this.graphic = graphic;
        this.padRadius = (graphic.get("width") + graphic.get("height")) / 4;
        this.ignoreStatus = ignoreStatus
    }
}


getPadsList = function (obj) {
    padsList = [];
    let currentPageGraphics = findObjs({
        _pageid: obj.get("_pageid"),
        _type: "graphic",
        _subtype: "token",
        layer: "gmlayer"
    });
    _.each(currentPageGraphics, function (graphic) {
        if (graphic.get("represents") === "") {
            return;
        }
        let characterId = graphic.get("represents");
        let characterAttributes = getChatacterAttributes(characterId);
        if (isCharacterPad(characterAttributes)) {
            let ignoreStatus = getIgnoreStatus(characterAttributes);
            padsList.push(new Pad(characterId, graphic, ignoreStatus));
        }
    });
    return padsList;
}

getIgnoreStatus = function (characterAttributes) {
    let ignoreStatusAttribute = _.find(characterAttributes, function (attribute) {
        return attribute.get("name") === IGNORE_STATUS_ATTRIBUTE;
    });
    if (ignoreStatusAttribute !== undefined) {
        return ignoreStatusAttribute.get("current");
    }
    return undefined;
}

isCharacterPad = function (characterAttributes) {
    let onPressAttribute = getOnPressAttribute(characterAttributes);
    let onReleaseAttribute = getOnReleaseAttribute(characterAttributes);
    return (onPressAttribute !== undefined) || (onReleaseAttribute !== undefined);
}

getOnPressAttribute = function (characterAttributes) {
    return _.find(characterAttributes, function (attribute) {
        return attribute.get("name") === ON_PRESS_ATTRIBUTE;
    });
}

getOnReleaseAttribute = function (characterAttributes) {
    return _.find(characterAttributes, function (attribute) {
        return attribute.get("name") === ON_RELEASE_ATTRIBUTE;
    });
}

getOnCrossAttribute = function (characterAttributes) {
    return _.find(characterAttributes, function (attribute) {
        return attribute.get("name") === ON_CROSS_ATTRIBUTE;
    });
}

getChatacterAttributes = function (characterId) {
    return findObjs({
        _type: "attribute",
        _characterid: characterId
    });
}

onPress = function (pad, obj) {
    let characterAttributes = getChatacterAttributes(pad.characterId);
    let onPressAttribute = getOnPressAttribute(characterAttributes);
    if (onPressAttribute === undefined) {
        return;
    }
    let onPressAbilityName = onPressAttribute.get("current");
    runAbility(pad, obj, onPressAbilityName);
}

onRelease = function (pad, obj) {
    let characterAttributes = getChatacterAttributes(pad.characterId);
    let onReleaseAttribute = getOnReleaseAttribute(characterAttributes);
    if (onReleaseAttribute === undefined) {
        return;
    }
    let onReleaseAbilityName = onReleaseAttribute.get("current");
    runAbility(pad, obj, onReleaseAbilityName);
}

onCross = function (pad, obj) {
    let characterAttributes = getChatacterAttributes(pad.characterId);
    let onCrossAttribute = getOnCrossAttribute(characterAttributes);
    if (onCrossAttribute === undefined) {
        return;
    }
    let onCrossAbilityName = onCrossAttribute.get("current");
    runAbility(pad, obj, onCrossAbilityName);
}

runAbility = function (pad, obj, abilityName) {
    let characterAbilities = findObjs({
        _type: "ability",
        _characterid: pad.characterId,
        name: abilityName
    });
    _.each(characterAbilities, function (characterAbility) {
        let abilityAction = characterAbility.get("action");
        let modifiedAbilityAction = abilityAction
            .replace(PAD_ID_PLACEHOLDER, pad.graphic.get("_id"))
            .replace(TOKEN_ID_PLACEHOLDER, obj.get("_id"))
            .replace(PAD_NAME_PLACEHOLDER, pad.graphic.get("name"))
            .replace(PAD_GMNOTES_PLACEHOLDER, unescape(unescape(pad.graphic.get("gmnotes")).replace(/<.+?>/g, "")))
            .replace(TOKEN_GMNOTES_PLACEHOLDER, unescape(unescape(obj.get("gmnotes")).replace(/<.+?>/g, "")))
            .replace(PAD_PLACEHOLDER, function (x) { return pad.graphic.get(x.replace(PAD_PREFIX, "").replace(PLACEHOLDER_SUFFIX, "")); })
            .replace(TOKEN_PLACEHOLDER, function (x) { return obj.get(x.replace(TOKEN_PREFIX, "").replace(PLACEHOLDER_SUFFIX, "")); });
        sendChat("system", modifiedAbilityAction);
    });
}

movementCheck = function (obj) {
    if ((obj.get("_subtype") !== "token") || (obj.get("lastmove") === "") ||
        (obj.get("layer") !== "objects") || !isControlled(obj)) {
        return;
    }
    let objRadius = (obj.get("width") + obj.get("height")) / 4;
    let padsList = getPadsList(obj);
    _.each(padsList, function (pad) {
        if (isIgnored(pad, obj)) {
            return;
        }
        let crossed = isCrossed(obj, pad, objRadius);
        let isOn = isOnPad(obj, pad, objRadius);
        let wasOn = wasOnPad(obj, pad, objRadius);
        if (!wasOn && isOn) {
            // log("onPress");
            onPress(pad, obj);
        } else if (wasOn && !isOn) {
            // log("onRelease");
            onRelease(pad, obj);
        } else if (crossed) {
            // log("onCross");
            onCross(pad, obj);
        }
    });
}

isControlled = function (obj) {
    if (obj.get("controlledby") !== "") {
        // This token is directly controlled
        return true;
    }
    let characterId = obj.get("represents");
    if (characterId === "") {
        // This token isn't directly controlled nor represents any character
        return false;
    }
    let character = getObj("character", characterId);
    // Does The character represented by this token is controlled by anyone
    return character.get("controlledby") !== "";
}

isIgnored = function (pad, obj) {
    if (pad.ignoreStatus === undefined) {
        return false;
    }
    return obj.get(STATUS_PREFIX + pad.ignoreStatus);

}

isOnPad = function (obj, pad, objRadius) {
    hypot = Math.ceil(Math.sqrt(Math.pow((pad.graphic.get("left") - obj.get("left")), 2) + Math.pow((pad.graphic.get("top") - obj.get("top")), 2)));
    return hypot < (objRadius + pad.padRadius);
}

wasOnPad = function (obj, pad, objRadius) {
    let lastMoveArray = obj.get("lastmove").split(",");
    let lastX = lastMoveArray[0];
    let lastY = lastMoveArray[1];
    hypot = Math.ceil(Math.sqrt(Math.pow((pad.graphic.get("left") - lastX), 2) + Math.pow((pad.graphic.get("top") - lastY), 2)));
    return hypot < (objRadius + pad.padRadius);
}

isCrossed = function (obj, pad, objRadius) {
    let lastMoveArray = obj.get("lastmove").split(",");
    lastMoveArray.push(obj.get("left"));
    lastMoveArray.push(obj.get("top"));
    let padCenterX = pad.graphic.get("left");
    let padCenterY = pad.graphic.get("top");
    let objLastCenterX = lastMoveArray[0];
    let objLastCenterY = lastMoveArray[1];
    let i = 2;
    while (i < lastMoveArray.length) {
        let objCenterX = lastMoveArray[i];
        let objCenterY = lastMoveArray[i + 1];
        if (!((objLastCenterX == objCenterX) && (objLastCenterY == objCenterY))) {
            let distance = getDistance(objLastCenterX, objLastCenterY, objCenterX, objCenterY, padCenterX, padCenterY);
            let nextTo = isNextTo(objLastCenterX, objLastCenterY, objCenterX, objCenterY, padCenterX, padCenterY);
            if (nextTo && (distance < (objRadius + pad.padRadius))) {
                return true;
            }
        }
        objLastCenterX = objCenterX;
        objLastCenterY = objCenterY;
        i += 2;
    }
    return false;
}

getDistance = function (x0, y0, x1, y1, x2, y2) {
    // Measure the distance between the line passing through (x0, y0) and (x1, y1) and the point (x2, y2)
    let d;
    if (x1 == x0) {
        d = Math.abs(x2 - x0);
    } else {
        let a = (y1 - y0) / (x1 - x0);
        let c = y0 - x0 * (y1 - y0) / (x1 - x0);
        let b = -1;
        d = Math.abs(a * x2 + b * y2 + c) / Math.sqrt(a * a + b * b);
    }
    return d;
}

isNextTo = function (x0, y0, x1, y1, x2, y2) {
    // The point on the line passing through (x0, y0) and (x1, y1) closest to (x2,y2)should only be inside
    // the section (x0, y0)~(x1, y1) if and only if when constructing a triangle between (x0, y0), (x1, y1) and (x2, y2)
    // and both angles adjacent to (x0, y0)~(x1, y1) are less than 90 degrees
    // Use inner product to asses these angles. (A * B = |A| * |B| * cos(theta))
    let innerProduct = ((x1 - x0) * (x2 - x0) + (y1 - y0) * (y2 - y0));
    let innerProduct2 = ((x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1));
    return (innerProduct >= 0) && (innerProduct2 >= 0);
}

on("change:graphic", movementCheck);