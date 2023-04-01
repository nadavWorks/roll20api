applyModifications = function (pathsIds, modifications) {
    let paths = getPaths(pathsIds);
    _.each(paths, function (path) {
        applyLayer(path, modifications);
        applyFill(path, modifications);
        applyStroke(path, modifications);
        applyLeft(path, modifications);
        applyTop(path, modifications);
    });
}

applyLayer = function (path, modifications) {
    if (modifications.layer === undefined) {
        return;
    }
    applyValue(path, "layer", modifications.layer);
}

applyFill = function (path, modifications) {
    if (modifications.fill === undefined) {
        return;
    }
    applyValue(path, "fill", modifications.fill);
}

applyStroke = function (path, modifications) {
    if (modifications.stroke === undefined) {
        return;
    }
    applyValue(path, "stroke", modifications.stroke);
}

applyLeft = function (path, modifications) {
    applyMove(path, modifications.left, "left");
}

applyTop = function (path, modifications) {
    applyMove(path, modifications.top, "top");
}

applyMove = function (path, move, moveName) {
    if (move === undefined) {
        return;
    }
    if (move.operation === '+') {
        move.value += path.get(moveName);
    } else if (move.operation === '-') {
        move.value = path.get(moveName) - move.value;
    }
    path.set(moveName, move.value);
}

applyValue = function (path, key, value) {
    path.set(key, value.replace(/^\s+|\s+$/gm, '').toLowerCase());
}

getPaths = function (pathsIds) {
    let paths = [];
    _.each(_.uniq(pathsIds), function (pathId) {
        let path = getObj("path", pathId);
        if (path !== undefined) {
            paths.push(path);
        }
    });
    return paths;
}

getValidatedLayer = function (layer) {
    if (/^(?:gmlayer|objects|map|walls)$/.test(layer)) {
        return layer;
    }
    sendChat("PathMod", "Error: invalid layer: " + layer);
    return undefined;
}

getValidatedColor = function (color) {
    if ((color == "transparent") || (/^#[0-9a-fA-F]{6}$/.test(color))) {
        return color;
    }
    sendChat("PathMod", "Error: invalid color: " + color);
    return undefined;
}

getValidatedMove = function (move) {
    let match = move.match(/^([\+\-]?)(\d+)$/);
    if (match == undefined) {
        sendChat("PathMod", "Error: invalid move: " + move);
        return undefined;
    }
    return {
        operation: match[1],
        value: parseInt(match[2])
    }
}

usage = function () {
    sendChat("PathMod", "usage !path-mod [--help] | [--ignore-selected] [--ids <path_id> [<path_id>..]]\n" +
        "                [--layer gmlayer|objects|map|walls]\n" +
        "                [--fill transparent|#rrggbb] [--stroke transparent|#rrggbb]\n" +
        "                [--left [+-]pixels] [--top [+-]pixels]");
}

handleInput = function (msg) {
    if (msg.type !== "api") {
        return;
    }
    let ignoreSelected = false;
    let pathsIds = [];
    let modifications = {
        fill: undefined,
        layer: undefined,
        left: undefined,
        stroke: undefined,
        top: undefined
    };

    args = msg.content.split(/\s+--/);
    switch (args.shift()) {
        case '!path-mod':
            while (args.length) {
                let cmds = args.shift().match(/([^\s]+)/g);
                let cmd = cmds.shift();
                switch (cmd) {
                    case 'help':
                        usage();
                        return;
                    case 'ignore-selected':
                        ignoreSelected = true;
                        break;
                    case 'ids':
                        pathsIds = _.union(cmds, pathsIds);
                        break;
                    case 'layer':
                        modifications.layer = getValidatedLayer(cmds.shift());
                        break;
                    case 'fill':
                        modifications.fill = getValidatedColor(cmds.shift());
                        break;
                    case 'stroke':
                        modifications.stroke = getValidatedColor(cmds.shift());
                        break;
                    case 'left':
                        modifications.left = getValidatedMove(cmds.shift());
                        break;
                    case 'top':
                        modifications.top = getValidatedMove(cmds.shift());
                        break;
                    default:
                        sendChat("PathMod", "Error: Unrecognized command: " + cmd);
                        break;
                }
            }
            break;
    }

    // log(modifications);
    if (!ignoreSelected) {
        pathsIds = _.union(pathsIds, _.pluck(msg.selected, '_id'));
    }
    applyModifications(pathsIds, modifications);
}


on('chat:message', handleInput);
