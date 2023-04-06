"use strict";

var WALL_ATTRIBUTE = "wall";
var TILE_SIZE = 70;
var EXPANSION = 2;
var PATHS_COLOR = "#FF0000";

const WallTypeAttribute = {
    DYNAMIC: "dynamic",
    STATIC: "static",
};

const TileType = {
    OFF: 0,
    STATIC: 1,
    DYNAMIC: 2,
};

const WALL_TYPE_TO_TILE_TYPE = {
    [WallTypeAttribute.DYNAMIC]: TileType.DYNAMIC,
    [WallTypeAttribute.STATIC]: TileType.STATIC,
};

getTileTypeFromWallTypeAttribute = function (wallTypeAttribute) {
    return WALL_TYPE_TO_TILE_TYPE[wallTypeAttribute] || TileType.OFF;
};

class BoundingBox {
    constructor(left, top, width, height) {
        this.left = left;
        this.top = top;
        this.width = width;
        this.height = height;
    }

    get right() {
        return this.left + this.width;
    }

    get bottom() {
        return this.top + this.height;
    }

    toString() {
        return `BoundingBox(left=${this.left}, top=${this.top}, width=${this.width}, height=${this.height})`;
    }
}

class WallInfo {
    constructor(graphic, boundingBox, wallType) {
        this.graphic = graphic;
        this.boundingBox = boundingBox;
        this.wallType = wallType;
    }

    toString() {
        return `WallInfo(graphic=${this.graphic.id}}, boundingBox=${this.boundingBox})`;
    }
}

class PathsSet {
    constructor() {
        this.set = new Set();
    }

    hash(path) {
        return JSON.stringify(path, Object.keys(path).sort());
    }

    add(path) {
        this.set.add(this.hash(path));
    }

    contains(path) {
        return this.set.has(this.hash(path));
    }
}

getChatacterAttributes = function (characterId) {
    return findObjs({
        _type: "attribute",
        _characterid: characterId,
    });
};

getWallAttribute = function (characterAttributes) {
    let attribute = _.find(characterAttributes, function (attribute) {
        return attribute.get("name") === WALL_ATTRIBUTE;
    });
    if (attribute !== undefined) {
        return attribute.get("current");
    }
};

alignTo = function (value, alignment) {
    return Math.round(value / alignment) * alignment;
};

getBoundingBoxForGraphic = function (graphic) {
    return getBoundingBox(
        graphic.get("left"),
        graphic.get("top"),
        graphic.get("width"),
        graphic.get("height"),
        graphic.get("rotation"),
    );
};

getBoundingBox = function (graphicLeft, graphicTop, graphicWidth, graphicHeight, graphicRotation) {
    let width = alignTo(graphicWidth, TILE_SIZE);
    let height = alignTo(graphicHeight, TILE_SIZE);

    if (graphicRotation == 90 || graphicRotation == 270) {
        let swap = width;
        width = height;
        height = swap;
    }

    // `left` and `top` represent the distance from the top-left corner to the object's center
    let left = alignTo(graphicLeft - width / 2, TILE_SIZE);
    let top = alignTo(graphicTop - height / 2, TILE_SIZE);

    return new BoundingBox(left, top, width, height);
};

expandBoundingBox = function (boundingBox, expansion) {
    return new BoundingBox(
        boundingBox.left - expansion,
        boundingBox.top - expansion,
        boundingBox.width + 2 * expansion,
        boundingBox.height + 2 * expansion,
    );
};

isValidWall = function (wallTypeAttribute) {
    return wallTypeAttribute === WallTypeAttribute.STATIC || wallTypeAttribute == WallTypeAttribute.DYNAMIC;
};

getWallTypeAttribute = function (graphic) {
    let characterId = graphic.get("represents");
    if (characterId === "") {
        return;
    }

    let characterAttributes = getChatacterAttributes(characterId);
    return getWallAttribute(characterAttributes);
};

areOverlapping = function (boundingBox1, boundingBox2) {
    return (
        boundingBox1.left < boundingBox2.right &&
        boundingBox2.left < boundingBox1.right &&
        boundingBox1.top < boundingBox2.bottom &&
        boundingBox2.top < boundingBox1.bottom
    );
};

contains = function (container, containee) {
    return (
        container.left <= containee.left &&
        container.right >= containee.right &&
        container.top <= containee.top &&
        container.bottom >= containee.bottom
    );
};

getWallsOverlappingWithBoundingBox = function (boundingBox, pageId, excludedId) {
    let mapTokens = findObjs({
        _pageid: pageId,
        _type: "graphic",
        _subtype: "token",
        layer: "map",
    });

    let validWalls = [];
    _.each(mapTokens, function (token) {
        if (excludedId == token.id) {
            return;
        }
        let wallTypeAttribute = getWallTypeAttribute(token);
        if (isValidWall(wallTypeAttribute)) {
            let wallBoundingBox = getBoundingBoxForGraphic(token);
            // log(`Checking wall bounding box: ${wallBoundingBox}`);
            if (areOverlapping(boundingBox, wallBoundingBox)) {
                validWalls.push(
                    new WallInfo(token, wallBoundingBox, getTileTypeFromWallTypeAttribute(wallTypeAttribute)),
                );
            }
        }
    });
    return validWalls;
};

pathToString = function (path) {
    let fields = ["left", "top", "width", "height", "stroke"];
    return `Path(${_.map(fields, function (field) {
        return `${field}=${obj.get(field)}`;
    }).join(", ")})`;
};

prettifyMatrix = function (matrix) {
    let matrixStr = matrix
        .map(function (row) {
            return `[${row.join(", ")}]`;
        })
        .join(",\n");
    return `[\n${matrixStr}\n]`;
};

getRegionalMap = function (boundingBox, walls) {
    // Consider using only the outer frame
    // When adding paths, we don't really need the interior, so optimization may be possible
    // No idea about other actions though

    // log(`boundingBox: ${boundingBox}`);
    let regionRows = Math.round(boundingBox.height / TILE_SIZE);
    let regionColumns = Math.round(boundingBox.width / TILE_SIZE);

    let tiles = Array(regionRows);
    for (let i = 0; i < tiles.length; i++) {
        tiles[i] = Array(regionColumns).fill(TileType.OFF);
    }

    // Assuming STATIC and DYNAMIC walls don't overlap (each group may overlap with itself)
    _.each(walls, function (wall) {
        let wallBoundingBox = wall.boundingBox;
        let wallType = wall.wallType;

        let firstRowIndex = Math.max(0, Math.round((wallBoundingBox.top - boundingBox.top) / TILE_SIZE));
        let rowCount = Math.round(
            (Math.min(wallBoundingBox.bottom, boundingBox.bottom) - Math.max(wallBoundingBox.top, boundingBox.top)) /
                TILE_SIZE,
        );
        let firstColumnIndex = Math.max(0, Math.round((wallBoundingBox.left - boundingBox.left) / TILE_SIZE));
        let columnCount = Math.round(
            (Math.min(wallBoundingBox.right, boundingBox.right) - Math.max(wallBoundingBox.left, boundingBox.left)) /
                TILE_SIZE,
        );

        // log(`firstRowIndex: ${firstRowIndex}`);
        // log(`rowCount: ${rowCount}`);
        // log(`firstColumnIndex: ${firstColumnIndex}`);
        // log(`columnCount: ${columnCount}`);

        for (let i = 0; i < rowCount; i++) {
            tiles[firstRowIndex + i].fill(wallType, firstColumnIndex, firstColumnIndex + columnCount);
        }
    });
    // log(`Regional Map: ${prettifyMatrix(tiles)}`);
    return tiles;
};

isNormalPath = function (selfTileType, otherTileType) {
    return selfTileType !== TileType.OFF && otherTileType !== TileType.OFF;
};

isDiagonalPath = function (selfTileType, otherTileType1, otherTileType2) {
    return (
        (selfTileType == TileType.STATIC && otherTileType1 !== TileType.STATIC && otherTileType2 !== TileType.STATIC) ||
        (selfTileType == TileType.DYNAMIC && otherTileType1 == TileType.OFF && otherTileType2 == TileType.OFF)
    );
};

/**
 * Adds a path.
 *
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 */
addPath = function (parameters) {
    let oldPaths = findObjs(parameters);
    if (oldPaths.length == 0) {
        createObj("path", parameters);
    }
};

removePaths = function (paths) {
    _.each(paths, function (path) {
        pathObjects = findObjs(path);
        _.each(pathObjects, function (pathObject) {
            pathObject.remove();
        });
    });
};

addPaths = function (pathsParameters) {
    _.each(pathsParameters, function (pathParameters) {
        addPath(pathParameters);
    });
};

getPathParameters = function (pageId, x1, y1, x2, y2, left, top, width, height) {
    return {
        _pageid: pageId,
        _type: "path",
        layer: "walls",
        path: JSON.stringify([
            ["M", x1, y1],
            ["L", x2, y2],
        ]),
        fill: "transparent",
        stroke: PATHS_COLOR,
        width: width,
        height: height,
        left: left + width / 2,
        top: top + height / 2,
        rotation: 0,
    };
};

/**
 * Returns a vertical path.
 *
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 * @param length    length of the path.
 */
getVerticalPath = function (pageId, left, top, length) {
    return getPathParameters(pageId, 0, 0, 0, length, left, top, 0, length);
};

/**
 * Returns a horizontal path.
 *
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate of the path.
 * @param length    length of the path.
 */
getHorizontalPath = function (pageId, left, top, length) {
    return getPathParameters(pageId, 0, 0, length, 0, left, top, length, 0);
};

/**
 * Returns a diagonal path from bottom-left to top-right.
 *
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 * @param length    length of the path X or Y parts.
 */
getSlashPath = function (pageId, left, top, length) {
    return getPathParameters(pageId, 0, length, length, 0, left, top, length, length);
};

/**
 * Returns a diagonal path from top-left to bottom-right.
 *
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 * @param length    length of the path X or Y parts.
 */
getBackSlashPath = function (pageId, left, top, length) {
    return getPathParameters(pageId, 0, 0, length, length, left, top, length, length);
};

getRequiredDiagonalPaths = function (regionalMap, boundingBox, pageId) {
    let pathsParameters = [];
    let lastRowIndex = regionalMap.length - 1;
    let lastColumnIndex = regionalMap[0].length - 1;
    for (let i = 0; i <= lastRowIndex; i++) {
        for (let j = 0; j <= lastColumnIndex; j++) {
            let tileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;
            let tileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;
            // Handle top-left backslash path
            if (i > 0 && j > 0 && isDiagonalPath(regionalMap[i][j], regionalMap[i - 1][j], regionalMap[i][j - 1])) {
                pathsParameters.push(
                    getBackSlashPath(pageId, tileCenterX - TILE_SIZE / 2, tileCenterY - TILE_SIZE / 2, TILE_SIZE / 2),
                );
            }

            // Handle top-right slash path
            if (
                i > 0 &&
                j < lastColumnIndex &&
                isDiagonalPath(regionalMap[i][j], regionalMap[i - 1][j], regionalMap[i][j + 1])
            ) {
                pathsParameters.push(getSlashPath(pageId, tileCenterX, tileCenterY - TILE_SIZE / 2, TILE_SIZE / 2));
            }

            // Handle bottom-left slash path
            if (
                i < lastRowIndex &&
                j > 0 &&
                isDiagonalPath(regionalMap[i][j], regionalMap[i + 1][j], regionalMap[i][j - 1])
            ) {
                pathsParameters.push(getSlashPath(pageId, tileCenterX - TILE_SIZE / 2, tileCenterY, TILE_SIZE / 2));
            }

            // Handle bottom-right backslash path
            if (
                i < lastRowIndex &&
                j < lastColumnIndex &&
                isDiagonalPath(regionalMap[i][j], regionalMap[i + 1][j], regionalMap[i][j + 1])
            ) {
                pathsParameters.push(getBackSlashPath(pageId, tileCenterX, tileCenterY, TILE_SIZE / 2));
            }
        }
    }

    return pathsParameters;
};

getRequiredHorizontalPaths = function (regionalMap, boundingBox, pageId) {
    let pathsParameters = [];
    let lastRowIndex = regionalMap.length - 1;
    let lastColumnIndex = regionalMap[0].length - 1;

    for (let j = 0; j < lastColumnIndex; j++) {
        let latestHorizontalPath = undefined;
        let tileTypeAboveLeft = regionalMap[0][j];
        let tileTypeAboveRight = regionalMap[0][j + 1];
        let hasPathAbove = isNormalPath(tileTypeAboveLeft, tileTypeAboveRight);
        for (let i = 0; i <= lastRowIndex; i++) {
            let tileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;
            let tileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;
            if (isNormalPath(regionalMap[i][j], regionalMap[i][j + 1])) {
                // We have a potential line, Check if we need to collect it
                let horizontalPath = getHorizontalPath(pageId, tileCenterX, tileCenterY, TILE_SIZE);

                if (regionalMap[i][j] == tileTypeAboveLeft && regionalMap[i][j + 1] == tileTypeAboveRight) {
                    // We continue in the same type combination as above us, just update the latest
                    latestHorizontalPath = horizontalPath;
                } else {
                    // We broke continuation, collect the path
                    pathsParameters.push(horizontalPath);
                    if (hasPathAbove && latestHorizontalPath !== undefined) {
                        // There was supposed to be a wall above us, collect the latest
                        pathsParameters.push(latestHorizontalPath);
                    }
                }
                hasPathAbove = true;
            } else {
                if (hasPathAbove && latestHorizontalPath !== undefined) {
                    // We've reached a flip from a path to no path, collect the latest path
                    pathsParameters.push(latestHorizontalPath);
                }
                hasPathAbove = false;
            }
            tileTypeAboveLeft = regionalMap[i][j];
            tileTypeAboveRight = regionalMap[i][j + 1];
        }
    }

    return pathsParameters;
};

getRequiredVerticalPaths = function (regionalMap, boundingBox, pageId) {
    let pathsParameters = [];
    let lastRowIndex = regionalMap.length - 1;
    let lastColumnIndex = regionalMap[0].length - 1;

    for (let i = 0; i < lastRowIndex; i++) {
        let latestVerticalPath = undefined;
        let tileTypeLeftTop = regionalMap[i][0];
        let tileTypeLeftBottom = regionalMap[i + 1][0];
        let hasPathLeft = isNormalPath(tileTypeLeftTop, tileTypeLeftBottom);
        for (let j = 0; j <= lastColumnIndex; j++) {
            let tileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;
            let tileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;
            if (isNormalPath(regionalMap[i][j], regionalMap[i + 1][j])) {
                // We have a potential line, Check if we need to collect it
                let verticalPath = getVerticalPath(pageId, tileCenterX, tileCenterY, TILE_SIZE);

                if (regionalMap[i][j] == tileTypeLeftTop && regionalMap[i + 1][j] == tileTypeLeftBottom) {
                    // We continue in the same type combination as to our left, just update the latest
                    latestVerticalPath = verticalPath;
                } else {
                    // We broke continuation, collect the path
                    pathsParameters.push(verticalPath);
                    if (hasPathLeft && latestVerticalPath !== undefined) {
                        // There was supposed to be a wall to our left, collect the latest
                        pathsParameters.push(latestVerticalPath);
                    }
                }
                hasPathLeft = true;
            } else {
                if (hasPathLeft && latestVerticalPath !== undefined) {
                    // We've reached a flip from a path to no path, collect the latest path
                    pathsParameters.push(latestVerticalPath);
                }
                hasPathLeft = false;
            }
            tileTypeLeftTop = regionalMap[i][j];
            tileTypeLeftBottom = regionalMap[i + 1][j];
        }
    }

    return pathsParameters;
};

getRequiredPaths = function (regionalMap, boundingBox, pageId) {
    let pathsParameters = [];

    // Get diagonals
    pathsParameters.push(...getRequiredDiagonalPaths(regionalMap, boundingBox, pageId));

    // Get Horizontals
    pathsParameters.push(...getRequiredHorizontalPaths(regionalMap, boundingBox, pageId));

    // Get Verticals
    pathsParameters.push(...getRequiredVerticalPaths(regionalMap, boundingBox, pageId));

    return pathsParameters;
};

getPathsSet = function (paths) {
    let pathsSet = new PathsSet();
    _.each(paths, function (path) {
        pathsSet.add(path);
    });
    return pathsSet;
};

insertCurrentWall = function (regionalMap, tileType) {
    let innerRegionLastRowIndex = regionalMap.length - 1 - EXPANSION;
    let innerRegionLastColumnIndex = regionalMap[0].length - 1 - EXPANSION;

    for (let i = EXPANSION; i <= innerRegionLastRowIndex; i++) {
        for (let j = EXPANSION; j <= innerRegionLastColumnIndex; j++) {
            regionalMap[i][j] = tileType;
        }
    }
};

subtract = function (paths, pathsSet) {
    let result = [];
    _.each(paths, function (path) {
        if (!pathsSet.contains(path)) {
            result.push(path);
        }
    });
    return result;
};

handlePaths = function (oldPaths, newPaths) {
    let oldPathsSet = getPathsSet(oldPaths);
    let newPathsSet = getPathsSet(newPaths);
    let pathsToAdd = subtract(newPaths, oldPathsSet);
    let pathsToRemove = subtract(oldPaths, newPathsSet);
    addPaths(pathsToAdd);
    removePaths(pathsToRemove);
};

areEqualBoundingBoxes = function (boundingBox1, boundingBox2) {
    return (
        boundingBox1.left == boundingBox2.left &&
        boundingBox1.top == boundingBox2.top &&
        boundingBox1.width == boundingBox2.width &&
        boundingBox1.height == boundingBox2.height
    );
};

handleInsertion = function (graphic, boundingBox, pageId) {
    let [oldPaths, newPaths] = getPathsLists(graphic, boundingBox, pageId);
    handlePaths(oldPaths, newPaths);
};

handleDeletion = function (graphic, boundingBox, pageId) {
    let [newPaths, oldPaths] = getPathsLists(graphic, boundingBox, pageId);
    handlePaths(oldPaths, newPaths);
};

getPathsLists = function (graphic, boundingBox, pageId) {
    let expandedBoundingBox = expandBoundingBox(boundingBox, TILE_SIZE * EXPANSION);
    let overlappingWalls = getWallsOverlappingWithBoundingBox(expandedBoundingBox, pageId, graphic.id);
    let regionalMap = getRegionalMap(expandedBoundingBox, overlappingWalls);
    log(`regionalMap: ${prettifyMatrix(regionalMap)}`);
    let tileType = getTileTypeFromWallTypeAttribute(wallTypeAttribute);
    let pathsWithoutGraphic = getRequiredPaths(regionalMap, expandedBoundingBox, pageId);
    insertCurrentWall(regionalMap, tileType);
    log(`regionalMap after insertion : ${prettifyMatrix(regionalMap)}`);
    let pathsWithGraphic = getRequiredPaths(regionalMap, expandedBoundingBox, pageId);
    return [pathsWithoutGraphic, pathsWithGraphic];
};

insertionCheck = function (graphic) {
    if (graphic.get("layer") !== "objects" && graphic.get("layer") !== "map") {
        return;
    }

    wallTypeAttribute = getWallTypeAttribute(graphic);
    if (!isValidWall(wallTypeAttribute)) {
        return;
    }
    let boundingBox = getBoundingBoxForGraphic(graphic);
    let pageId = graphic.get("_pageid");
    handleInsertion(graphic, boundingBox, pageId);
    return;
};

deletionCheck = function (graphic) {
    if (graphic.get("layer") !== "objects" && graphic.get("layer") !== "map") {
        return;
    }

    wallTypeAttribute = getWallTypeAttribute(graphic);
    if (!isValidWall(wallTypeAttribute)) {
        return;
    }
    let boundingBox = getBoundingBoxForGraphic(graphic);
    let pageId = graphic.get("_pageid");
    handleDeletion(graphic, boundingBox, pageId);
    return;
};

movementCheck = function (graphic, previous) {
    if (graphic.get("layer") !== "objects" && graphic.get("layer") !== "map") {
        return;
    }

    wallTypeAttribute = getWallTypeAttribute(graphic);
    if (!isValidWall(wallTypeAttribute)) {
        return;
    }

    let oldBoundingBox = getBoundingBox(
        previous["left"],
        previous["top"],
        previous["width"],
        previous["height"],
        previous["rotation"],
    );
    let newBoundingBox = getBoundingBoxForGraphic(graphic);
    if (areEqualBoundingBoxes(oldBoundingBox, newBoundingBox)) {
        return;
    }

    let pageId = graphic.get("_pageid");

    // remove the wall from the old location
    handleDeletion(graphic, oldBoundingBox, pageId);

    // add the wall to the new location
    handleInsertion(graphic, newBoundingBox, pageId);
};

on("ready", function () {
    on("add:token", insertionCheck);
    on("destroy:token", deletionCheck);
    on("change:token", movementCheck);
});
