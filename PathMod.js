applyPathModifications = function (pathsIds, modifications) {
    let paths = getPaths(pathsIds);
    _.each(paths, function (path) {
        applyLayer(path, modifications);
        applyFill(path, modifications);
        applyStroke(path, modifications);
        applyLeft(path, modifications);
        applyTop(path, modifications);
    });
};

applyLayer = function (path, modifications) {
    if (modifications.layer === undefined) {
        return;
    }
    applyValue(path, "layer", modifications.layer);
};

applyFill = function (path, modifications) {
    if (modifications.fill === undefined) {
        return;
    }
    applyValue(path, "fill", modifications.fill);
};

applyStroke = function (path, modifications) {
    if (modifications.stroke === undefined) {
        return;
    }
    applyValue(path, "stroke", modifications.stroke);
};

applyLeft = function (path, modifications) {
    applyMove(path, modifications.left, "left");
};

applyTop = function (path, modifications) {
    applyMove(path, modifications.top, "top");
};

applyMove = function (path, move, moveName) {
    if (move === undefined) {
        return;
    }
    if (move.operation === "+") {
        move.value += path.get(moveName);
    } else if (move.operation === "-") {
        move.value = path.get(moveName) - move.value;
    }
    path.set(moveName, move.value);
};

applyValue = function (path, key, value) {
    path.set(key, value.replace(/^\s+|\s+$/gm, "").toLowerCase());
};

applyDoorModifications = function (doorsIds, modifications) {
    let doors = getDoors(doorsIds);
    _.each(doors, function (door) {
        applyIsOpen(door, modifications);
        applyIsLocked(door, modifications);
        applyIsSecret(door, modifications);
    });
};

applyIsOpen = function (path, modifications) {
    if (modifications.isOpen === undefined) {
        return;
    }
    path.set("isOpen", modifications.isOpen);
};

applyIsLocked = function (path, modifications) {
    if (modifications.isLocked === undefined) {
        return;
    }
    path.set("isLocked", modifications.isLocked);
};

applyIsSecret = function (path, modifications) {
    if (modifications.isSecret === undefined) {
        return;
    }
    path.set("isSecret", modifications.isSecret);
};

getPaths = function (pathsIds) {
    let paths = [];
    _.each(_.uniq(pathsIds), function (pathId) {
        let path = getObj("path", pathId);
        if (path !== undefined) {
            paths.push(path);
        }
    });
    return paths;
};

getDoors = function (doorsIds) {
    let paths = [];
    _.each(_.uniq(doorsIds), function (doorId) {
        let path = getObj("door", doorId);
        if (path !== undefined) {
            paths.push(path);
        }
    });
    return paths;
};

getValidatedLayer = function (layer) {
    if (/^(?:gmlayer|objects|map|walls)$/.test(layer)) {
        return layer;
    }
    sendChat("PathMod", "Error: invalid layer: " + layer);
    return undefined;
};

getValidatedColor = function (color) {
    if (color == "transparent" || /^#[0-9a-fA-F]{6}$/.test(color)) {
        return color;
    }
    sendChat("PathMod", "Error: invalid color: " + color);
    return undefined;
};

getValidatedMove = function (move) {
    let match = move.match(/^([\+\-]?)(\d+)$/);
    if (match == undefined) {
        sendChat("PathMod", "Error: invalid move: " + move);
        return undefined;
    }
    return {
        operation: match[1],
        value: parseInt(match[2]),
    };
};

pathUsage = function () {
    sendChat(
        "PathMod",
        "usage !path-mod [--help] | [--ignore-selected] [--ids <path_id> [<path_id>..]]\n" +
            "                [--layer gmlayer|objects|map|walls]\n" +
            "                [--fill transparent|#rrggbb] [--stroke transparent|#rrggbb]\n" +
            "                [--left [+-]pixels] [--top [+-]pixels]",
    );
};

doorUsage = function () {
    sendChat(
        "PathMod",
        "usage !door-mod [--help] | [--ignore-selected] [--ids <path_id> [<path_id>..]]\n" +
            "                [--layer gmlayer|objects|map|walls]\n" +
            "                [--fill transparent|#rrggbb] [--stroke transparent|#rrggbb]\n" +
            "                [--left [+-]pixels] [--top [+-]pixels]",
    );
};

handleInput = function (msg) {
    if (msg.type !== "api") {
        return;
    }
    let ignoreSelected = false;
    let ids = [];
    let pathModifications = {
        fill: undefined,
        layer: undefined,
        left: undefined,
        stroke: undefined,
        top: undefined,
    };
    let dooorModifications = {
        isOpen: undefined,
        isLocked: undefined,
        isSecret: undefined,
    };

    args = msg.content.split(/\s+--/);
    switch (args.shift()) {
        case "!path-mod":
            while (args.length) {
                let cmds = args.shift().match(/([^\s]+)/g);
                let cmd = cmds.shift();
                switch (cmd) {
                    case "help":
                        pathUsage();
                        return;
                    case "ignore-selected":
                        ignoreSelected = true;
                        break;
                    case "ids":
                        ids = _.union(cmds, ids);
                        break;
                    case "layer":
                        pathModifications.layer = getValidatedLayer(cmds.shift());
                        break;
                    case "fill":
                        pathModifications.fill = getValidatedColor(cmds.shift());
                        break;
                    case "stroke":
                        pathModifications.stroke = getValidatedColor(cmds.shift());
                        break;
                    case "left":
                        pathModifications.left = getValidatedMove(cmds.shift());
                        break;
                    case "top":
                        pathModifications.top = getValidatedMove(cmds.shift());
                        break;
                    default:
                        sendChat("PathMod", "Error: Unrecognized command: " + cmd);
                        break;
                }
            }
            if (!ignoreSelected) {
                ids = _.union(ids, _.pluck(msg.selected, "_id"));
            }
            applyPathModifications(ids, pathModifications);
            break;
        case "!door-mod":
            while (args.length) {
                let cmds = args.shift().match(/([^\s]+)/g);
                let cmd = cmds.shift();
                switch (cmd) {
                    case "help":
                        doorUsage();
                        return;
                    case "ignore-selected":
                        ignoreSelected = true;
                        break;
                    case "ids":
                        ids = _.union(cmds, ids);
                        break;
                    case "open":
                        dooorModifications.isOpen = true;
                        break;
                    case "close":
                        dooorModifications.isOpen = false;
                        break;
                    case "lock":
                        dooorModifications.isLocked = true;
                        break;
                    case "unlock":
                        dooorModifications.isLocked = false;
                        break;
                    case "hide":
                        dooorModifications.isSecret = true;
                        break;
                    case "show":
                        dooorModifications.isSecret = false;
                        break;
                    default:
                        sendChat("DoorMod", "Error: Unrecognized command: " + cmd);
                        break;
                }
            }
            if (!ignoreSelected) {
                ids = _.union(ids, _.pluck(msg.selected, "_id"));
            }
            applyDoorModifications(ids, dooorModifications);
            break;
    }
};

on("chat:message", handleInput);
