"use strict";
const DoorBuilder = (() => {
    var IS_DOOR_ATTRIBUTE = "is_door";
    var DOOR_COLOR = "#00FF00";

    doorMovementCheck = function (graphic, previous) {
        let pageId = graphic.get("_pageid");
        if (previous["represents"] !== undefined) {
            let wasDoor = isDoor(getIsDoorAttribute(previous["represents"]));
            let isDoorNow = isValidDoor(graphic, true);
            if (wasDoor && !isDoorNow) {
                let doorParameters = getDoorParametersFromPrevious(previous, pageId);
                removeDoor(doorParameters);
                return;
            }
            if (!wasDoor && isDoorNow) {
                let doorParameters = getDoorParametersFromGraphic(graphic, pageId);
                createObj("door", doorParameters);
                return;
            }
        }

        if (!isValidDoor(graphic, false)) {
            return;
        }

        if (shouldAddDoor(graphic, previous)) {
            let doorParameters = getDoorParametersFromGraphic(graphic, pageId);
            createObj("door", doorParameters);
            return;
        }
        if (shouldRemoveDoor(graphic, previous)) {
            let doorParameters = getDoorParametersFromPrevious(previous, pageId);
            removeDoor(doorParameters);
            return;
        }
        if (!isValidDoor(graphic, true)) {
            return;
        }
        if (shouldMoveDoor(graphic, previous)) {
            moveDoor(graphic, previous, pageId);
            return;
        }
    };

    doorInsertionCheck = function (graphic) {
        if (!isValidDoor(graphic, true)) {
            return;
        }
        let pageId = graphic.get("_pageid");
        let doorParameters = getDoorParametersFromGraphic(graphic, pageId);
        createObj("door", doorParameters);
    };

    doorDeletionCheck = function (graphic) {
        if (!isValidDoor(graphic, true)) {
            return;
        }
        let pageId = graphic.get("_pageid");
        let doorParameters = getDoorParametersFromGraphic(graphic, pageId);
        removeDoor(doorParameters);
    };

    handleInput = function (msg) {
        if (msg.type !== "api") {
            return;
        }
        let parameters = {
            x: 0,
            y: 0,
            color: "#000000",
            isOpen: false,
            isLocked: false,
            isSecret: false,
            path: {
                handle0: {
                    x: 0,
                    y: 0,
                },
                handle1: {
                    x: 0,
                    y: 0,
                },
            },
        };

        args = msg.content.split(/\s+--/);
        switch (args.shift()) {
            case "!door":
                while (args.length) {
                    let cmds = args.shift().match(/([^\s]+)/g);
                    let cmd = cmds.shift();
                    switch (cmd) {
                        case "help":
                            usage();
                            return;
                        case "color":
                            parameters.color = getValidatedColor(cmds.shift());
                            break;
                        case "left":
                            parameters.x = parseInt(cmds.shift());
                            break;
                        case "top":
                            parameters.y = -parseInt(cmds.shift());
                            break;
                        case "x0":
                            parameters.path.handle0.x = parseInt(cmds.shift());
                            break;
                        case "y0":
                            parameters.path.handle0.y = -parseInt(cmds.shift());
                            break;
                        case "x1":
                            parameters.path.handle1.x = parseInt(cmds.shift());
                            break;
                        case "y1":
                            parameters.path.handle1.x = -parseInt(cmds.shift());
                            break;
                        default:
                            sendChat("DoorBuilder", "Error: Unrecognized command: " + cmd);
                            break;
                    }
                }
                createObj("door", parameters);
                break;
        }
    };

    usage = function () {
        sendChat(
            "DoorBuilder",
            "usage !door [--help] | [--color transparent|#rrggbb]\n" +
                "                [--left pixels] [--top pixels]\n" +
                "                [--x0 pixels] [--y0 pixels] [--x1 pixels] [--y1 pixels]",
        );
    };

    getValidatedColor = function (color) {
        if (color == "transparent" || /^#[0-9a-fA-F]{6}$/.test(color)) {
            return color;
        }
        sendChat("DoorBuilder", "Error: invalid color: " + color);
        return undefined;
    };

    removeDoor = function (doorParameters) {
        let doorObjects = findObjs({
            _pageid: doorParameters.pageid,
            _type: "door",
            x: doorParameters.x,
            y: doorParameters.y,
        });
        _.each(doorObjects, function (doorObject) {
            doorObject.remove();
        });
    };

    moveDoor = function (graphic, previous, pageId) {
        let oldDoorParameters = getDoorParametersFromPrevious(previous, pageId);
        removeDoor(oldDoorParameters);
        let newDoorParameters = getDoorParametersFromGraphic(graphic, pageId);
        createObj("door", newDoorParameters);
    };

    shouldAddDoor = function (graphic, previous) {
        return (
            (graphic.get("layer") === "objects" || graphic.get("layer") === "map") &&
            previous["layer"] !== "objects" &&
            previous["layer"] !== "map"
        );
    };

    shouldRemoveDoor = function (graphic, previous) {
        return (
            graphic.get("layer") !== "objects" &&
            graphic.get("layer") !== "map" &&
            (previous["layer"] === "objects" || previous["layer"] === "map")
        );
    };

    shouldMoveDoor = function (graphic, previous) {
        return (
            graphic.get("left") !== previous["left"] ||
            graphic.get("top") !== previous["top"] ||
            graphic.get("width") !== previous["width"] ||
            graphic.get("height") !== previous["height"] ||
            graphic.get("rotation") !== previous["rotation"]
        );
    };

    isValidDoor = function (graphic, checkLayer) {
        if (checkLayer && graphic.get("layer") !== "objects" && graphic.get("layer") !== "map") {
            return;
        }
        return isDoor(getIsDoorAttribute(graphic.get("represents")));
    };

    isDoor = function (doorAttribute) {
        return doorAttribute === "true" || doorAttribute === "1";
    };

    getIsDoorAttribute = function (characterId) {
        if (characterId === "") {
            return;
        }

        let characterAttributes = getChatacterAttributes(characterId);
        return getDoorAttribute(characterAttributes);
    };

    getChatacterAttributes = function (characterId) {
        return findObjs({
            _type: "attribute",
            _characterid: characterId,
        });
    };

    getDoorAttribute = function (characterAttributes) {
        let attribute = _.find(characterAttributes, function (attribute) {
            return attribute.get("name") === IS_DOOR_ATTRIBUTE;
        });
        if (attribute !== undefined) {
            return attribute.get("current");
        }
    };

    getDoorParametersFromGraphic = function (graphic, pageId) {
        let left = graphic.get("left");
        let top = graphic.get("top");
        let width = graphic.get("width");
        let height = graphic.get("height");
        let rotation = graphic.get("rotation");
        return getDoorParameters(left, top, width, height, rotation, pageId);
    };

    getDoorParametersFromPrevious = function (previous, pageId) {
        let left = previous["left"];
        let top = previous["top"];
        let width = previous["width"];
        let height = previous["height"];
        let rotation = previous["rotation"];
        return getDoorParameters(left, top, width, height, rotation, pageId);
    };

    getDoorParameters = function (left, top, width, height, rotation, pageId) {
        let x0, y0, x1, y1;

        if (width > height) {
            x0 = -width / 2;
            x1 = width / 2;
            y0 = y1 = 0;
        } else {
            x0 = x1 = 0;
            y0 = -height / 2;
            y1 = height / 2;
        }

        let newHandle0 = rotate(x0, y0, 0, 0, rotation);
        let newHandle1 = rotate(x1, y1, 0, 0, rotation);
        x0 = newHandle0.x;
        y0 = newHandle0.y;
        x1 = newHandle1.x;
        y1 = newHandle1.y;

        return {
            pageid: pageId,
            color: DOOR_COLOR,
            x: left,
            y: -top,
            isOpen: false,
            isLocked: false,
            isSecret: false,
            path: {
                handle0: {
                    x: x0,
                    y: -y0,
                },
                handle1: {
                    x: x1,
                    y: -y1,
                },
            },
        };
    };

    rotate = function (pointX, pointY, AxisX, AxisY, degrees) {
        let radians = (degrees * Math.PI) / 180;
        let newX = Math.round((pointX - AxisX) * Math.cos(radians) - (pointY - AxisY) * Math.sin(radians) + AxisX);
        let newY = Math.round((pointX - AxisX) * Math.sin(radians) + (pointY - AxisY) * Math.cos(radians) + AxisY);
        return {
            x: newX,
            y: newY,
        };
    };

    on("ready", function () {
        on("add:token", doorInsertionCheck);
        on("destroy:token", doorDeletionCheck);
        on("change:token", doorMovementCheck);
        on("chat:message", handleInput);
    });
})();
