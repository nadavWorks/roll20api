'use strict';
var MAIN_ATTRIBUTE = "carrier";
var ENABLED_ATTRIBUTE = "enabled";
var IDS_ATTRIBUTE = "ids";
var FACTOR_ATTRIBUTE = "factor";
var AUTO_ATTRIBUTE = "auto";
var API_CALL = "!movecarrier"


class LocationDiff {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

messageChek = function (msg) {
    if (msg.type == "api" && msg.content.indexOf(API_CALL) == 0) {
        msg.content = processInlinerolls(msg);

        let args = msg.content.split(/\s+--/);

        let idLsiist = [];
        let leftByValue = 0;
        let topByValue = 0;
        let leftValue = null;
        let topValue = null;
        let shouldApplyLocation = false;
        let shouldApplyLocationDiff = false;

        // remove api name fisrt
        args.shift();
        while (args.length) {
            let arg = args.shift();
            let argSplit = arg.split(/\s+/);
            let argName = argSplit.shift();
            let argValue = argSplit;
            switch (argName) {
                case "ids":
                    idLsiist = argValue;
                    break;

                case "left":
                    let leftRaw = argValue[0];
                    if (leftRaw.indexOf("=") == 0) {
                        leftValue = parseInt(leftRaw.slice(1));
                        shouldApplyLocation = true;
                    } else {
                        leftByValue = parseInt(leftRaw);
                        shouldApplyLocationDiff = true;
                    }
                    break;

                case "top":
                    let topRaw = argValue[0];
                    if (topRaw.indexOf("=") == 0) {
                        topValue = parseInt(topRaw.slice(1));
                        shouldApplyLocation = true;
                    } else {
                        topByValue = parseInt(topRaw);
                        shouldApplyLocationDiff = true;
                    }
                    break;
            }
        }

        _.each(idLsiist, function (id) {
            let locationDiff = new LocationDiff(leftByValue, topByValue);
            let location = new LocationDiff(leftValue, topValue);
            let carrier = getObj("graphic", id);
            if ((carrier.get("_subtype") !== "token") ||
                ((carrier.get("layer") !== "objects") && (carrier.get("layer") !== "map"))) {
                return;
            }

            let objectAttributes = getGMNoteAttributes(carrier);
            if (objectAttributes === null) {
                return;
            }

            let carrierConfig = getCarrierConfig(objectAttributes);
            if (!isCarrier(carrierConfig)) {
                return;
            }
            // Move the carrier itself
            if (shouldApplyLocationDiff) {
                applyLocationDiff(carrier, locationDiff, 1);
            }
            if (shouldApplyLocation) {
                applyLocation(carrier, location);
            }
            moveByCarrierByLocation(carrier, locationDiff, carrierConfig)
        });

    }
}

processInlinerolls = (msg) => {
    if (msg.hasOwnProperty('inlinerolls')) {
        return msg.inlinerolls
            .reduce((m, v, k) => {
                let ti = v.results.rolls.reduce((m2, v2) => {
                    if (v2.hasOwnProperty('table')) {
                        m2.push(v2.results.reduce((m3, v3) => [...m3, (v3.tableItem || {}).name], []).join(", "));
                    }
                    return m2;
                }, []).join(', ');
                return [...m, { k: `$[[${k}]]`, v: (ti.length && ti) || v.results.total || 0 }];
            }, [])
            .reduce((m, o) => m.replace(o.k, o.v), msg.content);
    } else {
        return msg.content;
    }
};

movementCheck = function (obj, prev) {
    if (
        (obj.get("_subtype") !== "token") ||
        ((obj.get("layer") !== "objects") && (obj.get("layer") !== "map")) ||
        (obj.get("lastmove") === "") ||
        isUnmoved(obj, prev)
    ) {
        return;
    }

    let objectAttributes = getGMNoteAttributes(obj);
    if (objectAttributes === null) {
        return;
    }

    let carrierConfig = getCarrierConfig(objectAttributes);
    if (!isCarrier(carrierConfig)) {
        return;
    }

    moveByCarrier(obj, carrierConfig);
}

isUnmoved = function (obj, prev) {
    return (
        (obj.get("left") - obj.get("width") / 2 === prev["left"] - prev["width"] / 2) &&
        (obj.get("top") - obj.get("height") / 2 === prev["top"] - prev["height"] / 2)
    );
}

getGMNoteAttributes = function (obj) {
    let raw = unescape(unescape(obj.get("gmnotes")).replace(/<.+?>/g, ""));
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

isCarrier = function (carrierConfig) {
    return (
        (carrierConfig !== undefined) &&
        ((carrierConfig[ENABLED_ATTRIBUTE] === undefined) || carrierConfig[ENABLED_ATTRIBUTE])
    );
}

isAutoCarrier = function (carrierConfig) {
    return (
        isCarrier(carrierConfig) &&
        (carrierConfig[AUTO_ATTRIBUTE] !== undefined) &&
        carrierConfig[AUTO_ATTRIBUTE]
    );
}

getCarrierConfig = function (objectAttributes) {
    return objectAttributes[MAIN_ATTRIBUTE];
}

getObjectsOnAutoCarrierList = function (carrier) {
    let objectsList = [];
    let currentPageGraphics = findObjs({
        _pageid: carrier.get("_pageid"),
        _type: "graphic",
        _subtype: "token",
        layer: "objects"
    });

    let carrierRadius = getRadius(carrier);
    _.each(currentPageGraphics, function (graphic) {
        // ignore self
        if (graphic == carrier) {
            return;
        }

        // ignore other carriers
        let objectAttributes = getGMNoteAttributes(graphic);
        if (objectAttributes !== null) {
            let carrierConfig = getCarrierConfig(objectAttributes);
            if (isCarrier(carrierConfig)) {
                return;
            }
        }

        if (isOnCarrier(graphic, carrier, carrierRadius)) {
            objectsList.push(graphic);
        }
    });

    let currentPagetexts = findObjs({
        _pageid: carrier.get("_pageid"),
        _type: "text",
        layer: "objects"
    });

    _.each(currentPagetexts, function (text) {
        if (isOnCarrier(text, carrier, carrierRadius)) {
            objectsList.push(text);
        }
    });

    return objectsList;
}

getRadius = function (obj) {
    return (obj.get("width") + obj.get("height")) / 4;
}

isOnCarrier = function (obj, carrier, carrierRadius) {
    let lastMoveArray = carrier.get("lastmove").split(",");
    let lastX = lastMoveArray[0];
    let lastY = lastMoveArray[1];
    let objRadius = getRadius(obj);
    hypot = Math.ceil(Math.sqrt(Math.pow((obj.get("left") - lastX), 2) + Math.pow((obj.get("top") - lastY), 2)));
    return hypot < (objRadius + carrierRadius);
}

getFactor = function (carrierConfig) {
    if (carrierConfig[FACTOR_ATTRIBUTE] !== undefined) {
        return carrierConfig[FACTOR_ATTRIBUTE];
    }
    return 1;
}

moveByCarrier = function (carrier, carrierConfig) {
    let locationDiff = getLocationDiff(carrier);
    moveByCarrierByLocation(carrier, locationDiff, carrierConfig);
}

moveByCarrierByLocation = function (carrier, locationDiff, carrierConfig) {
    _.each(carrierConfig[IDS_ATTRIBUTE], (id) => {
        let graphic = getObj("graphic", id);
        if (graphic) {
            applyLocationDiff(graphic, locationDiff, getFactor(carrierConfig));
        }
    });

    if (isAutoCarrier(carrierConfig)) {
        let objectsList = getObjectsOnAutoCarrierList(carrier);
        _.each(objectsList, function (object) {
            applyLocationDiff(object, locationDiff, getFactor(carrierConfig));
        });
    }
}

getLocationDiff = function (obj) {
    let lastMoveArray = obj.get("lastmove").split(",");
    let lastX = lastMoveArray[0];
    let lastY = lastMoveArray[1];
    return new LocationDiff(obj.get("left") - lastX, obj.get("top") - lastY);
}

applyLocationDiff = function (obj, locationDiff, factor) {
    let lastMoveValue = obj.get("left") + "," + obj.get("top");
    obj.set("left", obj.get("left") + locationDiff.x * factor);
    obj.set("top", obj.get("top") + locationDiff.y * factor);
    obj.set("lastmove", lastMoveValue);
}

applyLocation = function (obj, location) {
    let lastMoveValue = obj.get("left") + "," + obj.get("top");
    if (location.x != null) {
        obj.set("left", location.x);
    }
    if (location.y != null) {
        obj.set("top", location.y);
    }
    obj.set("lastmove", lastMoveValue);
}

on("change:token", movementCheck);
on('chat:message', messageChek);