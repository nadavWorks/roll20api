"use strict";

var WALL_ATTRIBUTE = "wall";
var TILE_SIZE = 70;
var EXPANSION = 2;
var STATIC_PATHS_COLOR = "#FF0000";
var DYNAMIC_PATHS_COLOR = "#00FF00";
var TRANSITION_PATHS_COLOR = "#FFFF00";
var IS_DYNAMIC_APPLIED = false; // Should we set dynamic walls' paths in walls layer and transition paths in gmlayer, or vice versa.

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

getWallTypeAttributeByCharacterId = function (characterId) {
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

isOrthogonalPath = function (selfTileType, otherTileType) {
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

getPathParameters = function (pageId, x1, y1, x2, y2, left, top, width, height, stroke) {
    let layer = "walls";
    if (
        (stroke == DYNAMIC_PATHS_COLOR && !IS_DYNAMIC_APPLIED) ||
        (stroke == TRANSITION_PATHS_COLOR && IS_DYNAMIC_APPLIED)
    ) {
        layer = "gmlayer";
    }
    return {
        _pageid: pageId,
        _type: "path",
        layer: layer,
        path: JSON.stringify([
            ["M", x1, y1],
            ["L", x2, y2],
        ]),
        fill: "transparent",
        stroke: stroke,
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
 * @param stroke    path color.
 */
getVerticalPath = function (pageId, left, top, length, stroke) {
    return getPathParameters(pageId, 0, 0, 0, length, left, top, 0, length, stroke);
};

/**
 * Returns a horizontal path.
 *
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate of the path.
 * @param length    length of the path.
 * @param stroke    path color.
 */
getHorizontalPath = function (pageId, left, top, length, stroke) {
    return getPathParameters(pageId, 0, 0, length, 0, left, top, length, 0, stroke);
};

/**
 * Returns a diagonal path from bottom-left to top-right.
 *
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 * @param length    length of the path X or Y parts.
 * @param stroke    path color.
 */
getSlashPath = function (pageId, left, top, length, stroke) {
    return getPathParameters(pageId, 0, length, length, 0, left, top, length, length, stroke);
};

/**
 * Returns a diagonal path from top-left to bottom-right.
 *
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 * @param length    length of the path X or Y parts.
 * @param stroke    path color.
 */
getBackSlashPath = function (pageId, left, top, length, stroke) {
    return getPathParameters(pageId, 0, 0, length, length, left, top, length, length, stroke);
};

getOrthogonalColor = function (selfTileType, otherTileType1) {
    if (selfTileType == otherTileType1 && selfTileType == TileType.STATIC) {
        return STATIC_PATHS_COLOR;
    }
    return DYNAMIC_PATHS_COLOR;
};

getDiagonalColor = function (selfTileType, otherTileType1, otherTileType2) {
    if (selfTileType == TileType.STATIC && otherTileType1 == otherTileType2 && otherTileType1 == TileType.OFF) {
        return STATIC_PATHS_COLOR;
    }
    if (selfTileType == TileType.DYNAMIC && otherTileType1 == otherTileType2 && otherTileType1 == TileType.OFF) {
        return DYNAMIC_PATHS_COLOR;
    }
    return TRANSITION_PATHS_COLOR;
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
                    getBackSlashPath(
                        pageId,
                        tileCenterX - TILE_SIZE / 2,
                        tileCenterY - TILE_SIZE / 2,
                        TILE_SIZE / 2,
                        getDiagonalColor(regionalMap[i][j], regionalMap[i - 1][j], regionalMap[i][j - 1]),
                    ),
                );
            }

            // Handle top-right slash path
            if (
                i > 0 &&
                j < lastColumnIndex &&
                isDiagonalPath(regionalMap[i][j], regionalMap[i - 1][j], regionalMap[i][j + 1])
            ) {
                pathsParameters.push(
                    getSlashPath(
                        pageId,
                        tileCenterX,
                        tileCenterY - TILE_SIZE / 2,
                        TILE_SIZE / 2,
                        getDiagonalColor(regionalMap[i][j], regionalMap[i - 1][j], regionalMap[i][j + 1]),
                    ),
                );
            }

            // Handle bottom-left slash path
            if (
                i < lastRowIndex &&
                j > 0 &&
                isDiagonalPath(regionalMap[i][j], regionalMap[i + 1][j], regionalMap[i][j - 1])
            ) {
                pathsParameters.push(
                    getSlashPath(
                        pageId,
                        tileCenterX - TILE_SIZE / 2,
                        tileCenterY,
                        TILE_SIZE / 2,
                        getDiagonalColor(regionalMap[i][j], regionalMap[i + 1][j], regionalMap[i][j - 1]),
                    ),
                );
            }

            // Handle bottom-right backslash path
            if (
                i < lastRowIndex &&
                j < lastColumnIndex &&
                isDiagonalPath(regionalMap[i][j], regionalMap[i + 1][j], regionalMap[i][j + 1])
            ) {
                pathsParameters.push(
                    getBackSlashPath(
                        pageId,
                        tileCenterX,
                        tileCenterY,
                        TILE_SIZE / 2,
                        getDiagonalColor(regionalMap[i][j], regionalMap[i + 1][j], regionalMap[i][j + 1]),
                    ),
                );
            }
        }
    }

    return pathsParameters;
};

getRequiredHorizontalPathsOfColumn = function (regionalMap, boundingBox, pageId, j) {
    let numOfRows = regionalMap.length;
    let tileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;

    let pathsParameters = [];
    let previousTileTypeLeft = regionalMap[0][j];
    let previousTileTypeRight = regionalMap[0][j + 1];
    let hasPreviousPath = isOrthogonalPath(previousTileTypeLeft, previousTileTypeRight);

    for (let i = 1; i < numOfRows; i++) {
        let currentTileTypeLeft = regionalMap[i][j];
        let currentTileTypeRight = regionalMap[i][j + 1];
        let hasCurrentPath = isOrthogonalPath(currentTileTypeLeft, currentTileTypeRight);

        // There are two cases in which we do nothing:
        // 1. Both current and previous (above) rows don't contain any path (empty case)
        // 2. Both current and previous (above) row have identical tile types (continuation case)
        // All other cases require adding at least one path
        let areSameType = currentTileTypeLeft == previousTileTypeLeft && currentTileTypeRight == previousTileTypeRight;
        if (!(hasPreviousPath && hasCurrentPath && areSameType)) {
            if (hasPreviousPath) {
                let previousTileCenterY = boundingBox.top + (i - 1) * TILE_SIZE + TILE_SIZE / 2;
                pathsParameters.push(
                    getHorizontalPath(
                        pageId,
                        tileCenterX,
                        previousTileCenterY,
                        TILE_SIZE,
                        getOrthogonalColor(previousTileTypeLeft, previousTileTypeRight),
                    ),
                );
            }
            if (hasCurrentPath) {
                let currentTileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;
                pathsParameters.push(
                    getHorizontalPath(
                        pageId,
                        tileCenterX,
                        currentTileCenterY,
                        TILE_SIZE,
                        getOrthogonalColor(currentTileTypeLeft, currentTileTypeRight),
                    ),
                );
            }
        }

        // Prepare for next iteration: current -> previous
        // Shifting values this way avoids calculating them twice
        previousTileTypeLeft = currentTileTypeLeft;
        previousTileTypeRight = currentTileTypeRight;
        hasPreviousPath = hasCurrentPath;
    }

    return pathsParameters;
};

getRequiredHorizontalPaths = function (regionalMap, boundingBox, pageId) {
    let lastColumnIndex = regionalMap[0].length - 1;
    let pathsParameters = [];
    for (let j = 0; j < lastColumnIndex; j++) {
        pathsParameters.push(...getRequiredHorizontalPathsOfColumn(regionalMap, boundingBox, pageId, j));
    }
    return pathsParameters;
};

getRequiredVerticalPathsOfRow = function (regionalMap, boundingBox, pageId, i) {
    let numOfColumns = regionalMap[i].length;
    let tileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;

    let pathsParameters = [];
    let previousTileTypeTop = regionalMap[i][0];
    let previousTileTypeBottom = regionalMap[i + 1][0];
    let hasPreviousPath = isOrthogonalPath(previousTileTypeTop, previousTileTypeBottom);

    for (let j = 1; j < numOfColumns; j++) {
        let currentTileTypeTop = regionalMap[i][j];
        let currentTileTypeBottom = regionalMap[i + 1][j];
        let hasCurrentPath = isOrthogonalPath(currentTileTypeTop, currentTileTypeBottom);

        // There are two cases in which we do nothing:
        // 1. Both current and previous (left) rows don't contain any path (empty case)
        // 2. Both current and previous (left) row have identical tile types (continuation case)
        // All other cases require adding at least one path
        let areSameType = currentTileTypeTop == previousTileTypeTop && currentTileTypeBottom == previousTileTypeBottom;
        if (!(hasPreviousPath && hasCurrentPath && areSameType)) {
            if (hasPreviousPath) {
                let previousTileCenterX = boundingBox.left + (j - 1) * TILE_SIZE + TILE_SIZE / 2;
                pathsParameters.push(
                    getVerticalPath(
                        pageId,
                        previousTileCenterX,
                        tileCenterY,
                        TILE_SIZE,
                        getOrthogonalColor(previousTileTypeTop, previousTileTypeBottom),
                    ),
                );
            }
            if (hasCurrentPath) {
                let currentTileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;
                pathsParameters.push(
                    getVerticalPath(
                        pageId,
                        currentTileCenterX,
                        tileCenterY,
                        TILE_SIZE,
                        getOrthogonalColor(currentTileTypeTop, currentTileTypeBottom),
                    ),
                );
            }
        }

        // Prepare for next iteration: current -> previous
        // Shifting values this way avoids calculating them twice
        previousTileTypeTop = currentTileTypeTop;
        previousTileTypeBottom = currentTileTypeBottom;
        hasPreviousPath = hasCurrentPath;
    }

    return pathsParameters;
};

getRequiredVerticalPaths = function (regionalMap, boundingBox, pageId) {
    let lastRowIndex = regionalMap.length - 1;
    let pathsParameters = [];
    for (let i = 0; i < lastRowIndex; i++) {
        pathsParameters.push(...getRequiredVerticalPathsOfRow(regionalMap, boundingBox, pageId, i));
    }
    return pathsParameters;
};

getRequiredPaths = function (regionalMap, boundingBox, pageId) {
    let pathsParameters = [];

    // Get diagonals
    pathsParameters.push(...getRequiredDiagonalPaths(regionalMap, boundingBox, pageId));

    // Get horizontals
    pathsParameters.push(...getRequiredHorizontalPaths(regionalMap, boundingBox, pageId));

    // Get verticals
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
    // log(`regionalMap: ${prettifyMatrix(regionalMap)}`);
    let tileType = getTileTypeFromWallTypeAttribute(wallTypeAttribute);
    let pathsWithoutGraphic = getRequiredPaths(regionalMap, expandedBoundingBox, pageId);
    insertCurrentWall(regionalMap, tileType);
    // log(`regionalMap after insertion : ${prettifyMatrix(regionalMap)}`);
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

getOldBoundingBox = function (previous) {
    return getBoundingBox(
        previous["left"],
        previous["top"],
        previous["width"],
        previous["height"],
        previous["rotation"],
    );
};

movementCheck = function (graphic, previous) {
    if (graphic.get("layer") !== "objects" && graphic.get("layer") !== "map") {
        return;
    }
    let pageId = graphic.get("_pageid");

    wallTypeAttribute = getWallTypeAttribute(graphic);
    if (!isValidWall(wallTypeAttribute)) {
        if (
            previous["represents"] !== graphic.get("represents") &&
            previous["represents"] !== "" &&
            isValidWall(getWallTypeAttributeByCharacterId(previous["represents"]))
        ) {
            // The graphic was changed to no longer represent a valid wall, remove wall traces
            let oldBoundingBox = getOldBoundingBox(previous);
            handleDeletion(graphic, oldBoundingBox, pageId);
        }
        return;
    }

    let oldBoundingBox = getOldBoundingBox(previous);
    let newBoundingBox = getBoundingBoxForGraphic(graphic);
    if (areEqualBoundingBoxes(oldBoundingBox, newBoundingBox)) {
        if (previous["represents"] !== graphic.get("represents")) {
            handleInsertion(graphic, newBoundingBox, pageId);
        }
        return;
    }

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
