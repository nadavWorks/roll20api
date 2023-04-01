"use strict";

var WALL_ATTRIBUTE = "wall";
var TILE_SIZE = 70;
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
}

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

getChatacterAttributes = function (characterId) {
    return findObjs({
        _type: "attribute",
        _characterid: characterId,
    });
}

getWallAttribute = function (characterAttributes) {
    let attribute = _.find(characterAttributes, function (attribute) {
        return attribute.get("name") === WALL_ATTRIBUTE;
    });
    if (attribute !== undefined) {
        return attribute.get("current");
    }
}

alignTo = function (value, alignment) {
    return Math.round(value / alignment) * alignment;
}

getBoundingBox = function (graphic) {
    // let rotation = graphic.get("rotation");
    let width = alignTo(graphic.get("width"), TILE_SIZE);
    let height = alignTo(graphic.get("height"), TILE_SIZE);

    // if ((rotation == 90) || (rotation == 270)) {
    //     let swap = width;
    //     width = height;
    //     height = swap;
    // }

    // `left` and `top` represent the distance from the top-left corner to the object's center
    let left = alignTo(graphic.get("left") - width / 2, TILE_SIZE);
    let top = alignTo(graphic.get("top") - height / 2, TILE_SIZE);

    return new BoundingBox(left, top, width, height);
}

expandBoundingBox = function (boundingBox, expansion) {
    return new BoundingBox(
        boundingBox.left - expansion,
        boundingBox.top - expansion,
        boundingBox.width + 2 * expansion,
        boundingBox.height + 2 * expansion,
    );
}

isValidWall = function (wallTypeAttribute) {
    return wallTypeAttribute === WallTypeAttribute.STATIC || wallTypeAttribute == WallTypeAttribute.DYNAMIC;
}

getWallTypeAttribute = function (graphic) {
    let characterId = graphic.get("represents");
    if (characterId === "") {
        return;
    }

    let characterAttributes = getChatacterAttributes(characterId);
    return getWallAttribute(characterAttributes);
}

areOverlapping = function (boundingBox1, boundingBox2) {
    return (
        boundingBox1.left < boundingBox2.right &&
        boundingBox2.left < boundingBox1.right &&
        boundingBox1.top < boundingBox2.bottom &&
        boundingBox2.top < boundingBox1.bottom
    );
}

contains = function (container, containee) {
    return (
        container.left <= containee.left &&
        container.right >= containee.right &&
        container.top <= containee.top &&
        container.bottom >= containee.bottom
    );
}

getWallsOverlappingWithBoundingBox = function (boundingBox, pageId) {
    let mapTokens = findObjs({
        _pageid: pageId,
        _type: "graphic",
        _subtype: "token",
        layer: "map",
    });

    let validWalls = [];
    _.each(mapTokens, function (token) {
        let wallTypeAttribute = getWallTypeAttribute(token);
        if (isValidWall(wallTypeAttribute)) {
            let wallBoundingBox = getBoundingBox(token);
            // log(`Checking wall bounding box: ${wallBoundingBox}`);
            if (areOverlapping(boundingBox, wallBoundingBox)) {
                validWalls.push(new WallInfo(token, wallBoundingBox, getTileTypeFromWallTypeAttribute(wallTypeAttribute)));
            }
        }
    });
    return validWalls;
    // return mapTokens.filter(token =>
    //     isValidWall(getWallTypeAttribute(token)) && areOverlapping(boundingBox, getBoundingBox(token))
    // );
}

pathToString = function (path) {
    return `Path(left=${path.get("left")}, top=${path.get("top")}, width=${path.get("width")}, height=${path.get("height")}, stroke=${path.get("stroke")})`;
}

getPathsInBoundingBox = function (boundingBox, pageId) {
    let wallsPaths = findObjs({
        _pageid: pageId,
        _type: "path",
        layer: "walls",
        // stroke: PATHS_COLOR,
    });
    let gmlayerPaths = findObjs({
        _pageid: pageId,
        _type: "path",
        layer: "gmlayer",
        // stroke: PATHS_COLOR,
    });
    // log(`wallsPaths: ${wallsPaths.map(pathToString)}`);
    // log(`gmlayerPaths: ${gmlayerPaths.map(pathToString)}`);

    let paths = wallsPaths.concat(gmlayerPaths);
    // log(`paths: ${paths.map(pathToString)}`);

    let containedPaths = []
    _.each(paths, function (path) {
        let pathBoundingBox = getBoundingBox(path);
        // log(`Checking path bounding box: ${pathBoundingBox}`);
        if (contains(boundingBox, pathBoundingBox)) {
            containedPaths.push(path);
        }
    });
    return containedPaths;
}

prettifyMatrix = function (matrix) {
    let matrixStr = matrix.map(function (row) {
        return `[${row.join(", ")}]`;
    }).join(",\n");
    return `[\n${matrixStr}\n]`;
}

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
        let rowCount = Math.round((
            Math.min(wallBoundingBox.bottom, boundingBox.bottom) -
            Math.max(wallBoundingBox.top, boundingBox.top)
        ) / TILE_SIZE);
        let firstColumnIndex = Math.max(0, Math.round((wallBoundingBox.left - boundingBox.left) / TILE_SIZE));
        let columnCount = Math.round((
            Math.min(wallBoundingBox.right, boundingBox.right) -
            Math.max(wallBoundingBox.left, boundingBox.left)
        ) / TILE_SIZE);

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
}

isNormalPath = function (selfTileType, otherTileType) {
    return selfTileType == TileType.STATIC && otherTileType == TileType.STATIC;
}

isDiagonalPath = function (selfTileType, otherTileType1, otherTileType2) {
    return (
        selfTileType !== TileType.OFF &&
        otherTileType1 !== TileType.STATIC &&
        otherTileType2 !== TileType.STATIC
    );
}

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
        createObj("path", parameters)
    }
}

getPathParameters = function (pageId, x1, y1, x2, y2, left, top, width, height) {
    return {
        _pageid: pageId,
        _type: "path",
        layer: "walls",
        path: JSON.stringify([['M', x1, y1], ['L', x2, y2]]),
        fill: "transparent",
        stroke: PATHS_COLOR,
        width: width,
        height: height,
        left: left + width / 2,
        top: top + height / 2,
        rotation: 0,
    };
}

/**
 * Adds a vertical path.
 * 
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 * @param length    length of the path.
 */
addVerticalPath = function (pageId, left, top, length) {
    addPath(getPathParameters(pageId, 0, 0, 0, length, left, top, 0, length));
}

/**
 * Adds a horizontal path.
 * 
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate of the path.
 * @param length    length of the path.
 */
addHorizontalPath = function (pageId, left, top, length) {
    addPath(getPathParameters(pageId, 0, 0, length, 0, left, top, length, 0));
}

/**
 * Adds a diagonal path from bottom-left to top-right.
 * 
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 * @param length    length of the path X or Y parts.
 */
getSlashPath = function (pageId, left, top, length) {
    getPathParameters(pageId, 0, length, length, 0, left, top, length, length);
}

/**
 * Adds a diagonal path from top-left to bottom-right.
 * 
 * @param pageId    ID of the page to add the path to.
 * @param left      X-coordinate for the leftmost point of the path.
 * @param top       Y-coordinate for the topmost point of the path.
 * @param length    length of the path X or Y parts.
 */
getBackSlashPath = function (pageId, left, top, length) {
    getPathParameters(pageId, 0, 0, length, length, left, top, length, length);
}

addTop = function (currentTileType, topTileType, tileCenterX, tileCenterY, pageId) {
    // Handle line upwards
    if (isNormalPath(currentTileType, topTileType)) {
        addVerticalPath(pageId, tileCenterX, tileCenterY - TILE_SIZE, TILE_SIZE);
    }
}

addLeft = function (currentTileType, leftTileType, tileCenterX, tileCenterY, pageId) {
    // Handle line leftwards
    if (isNormalPath(currentTileType, leftTileType)) {
        addHorizontalPath(pageId, tileCenterX - TILE_SIZE, tileCenterY, TILE_SIZE);
    }
}

addBottom = function (currentTileType, bottomTileType, tileCenterX, tileCenterY, pageId) {
    // Handle line downwards
    if (isNormalPath(currentTileType, bottomTileType)) {
        addVerticalPath(pageId, tileCenterX, tileCenterY, TILE_SIZE);
    }
}

addRight = function (currentTileType, rightTileType, tileCenterX, tileCenterY, pageId) {
    // Handle line rightwards
    if (isNormalPath(currentTileType, rightTileType)) {
        addHorizontalPath(pageId, tileCenterX, tileCenterY, TILE_SIZE);
    }
}

createExternalStandardPaths = function (boundingBox, tileType, regionalMap, pageId) {
    let innerRegionLastRowIndex = regionalMap.length - 2;
    let innerRegionLastColumnIndex = regionalMap[0].length - 2;

    // Top row
    let topRowCenterY = boundingBox.top + TILE_SIZE + TILE_SIZE / 2;
    for (let j = 1; j <= innerRegionLastColumnIndex; j++) {
        let tileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;
        addTop(tileType, regionalMap[0][j], tileCenterX, topRowCenterY, pageId);
    }

    // Left column
    let leftColumnCenterX = boundingBox.left + TILE_SIZE + TILE_SIZE / 2;
    for (let i = 1; i <= innerRegionLastRowIndex; i++) {
        let tileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;
        addLeft(tileType, regionalMap[i][0], leftColumnCenterX, tileCenterY, pageId);
    }

    // Bottom row
    let bottomRowCenterY = boundingBox.bottom - (TILE_SIZE + TILE_SIZE / 2);
    for (let j = 1; j <= innerRegionLastColumnIndex; j++) {
        let tileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;
        addBottom(tileType, regionalMap[innerRegionLastRowIndex + 1][j], tileCenterX, bottomRowCenterY, pageId);
    }

    // Right column
    let rightColumnCenterX = boundingBox.right - (TILE_SIZE + TILE_SIZE / 2);
    for (let i = 1; i <= innerRegionLastRowIndex; i++) {
        let tileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;
        addRight(tileType, regionalMap[i][innerRegionLastColumnIndex + 1], rightColumnCenterX, tileCenterY, pageId);
    }
}

createInternalStandardPaths = function (boundingBox, tileType, regionalMap, pageId) {
    let innerRegionLastRowIndex = regionalMap.length - 2;
    let innerRegionLastColumnIndex = regionalMap[0].length - 2;

    // Top and bottom rows
    let topRowCenterY = boundingBox.top + TILE_SIZE + TILE_SIZE / 2;
    let bottomRowCenterY = boundingBox.bottom - (TILE_SIZE + TILE_SIZE / 2);
    let isOneRow = topRowCenterY === bottomRowCenterY;
    for (let j = 1; j < innerRegionLastColumnIndex; j++) {
        let tileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;
        addHorizontalPath(pageId, tileCenterX, topRowCenterY, TILE_SIZE);
        if (!isOneRow) {
            addHorizontalPath(pageId, tileCenterX, bottomRowCenterY, TILE_SIZE);
        }
    }

    // Left and right columns
    let leftColumnCenterX = boundingBox.left + TILE_SIZE + TILE_SIZE / 2;
    let rightColumnCenterX = boundingBox.right - (TILE_SIZE + TILE_SIZE / 2);
    let isOneColumn = leftColumnCenterX === rightColumnCenterX;
    for (let i = 1; i < innerRegionLastRowIndex; i++) {
        let tileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;
        addVerticalPath(pageId, leftColumnCenterX, tileCenterY, TILE_SIZE);
        if (!isOneColumn) {
            addVerticalPath(pageId, rightColumnCenterX, tileCenterY, TILE_SIZE);
        }
    }
}

createStandardPaths = function (boundingBox, tileType, regionalMap, pageId) {
    createExternalStandardPaths(boundingBox, tileType, regionalMap, pageId);
    createInternalStandardPaths(boundingBox, tileType, regionalMap, pageId);
}

createDiagonalPaths = function (boundingBox, tileType, regionalMap, pageId) {
    let innerRegionLastRowIndex = regionalMap.length - 2;
    let innerRegionLastColumnIndex = regionalMap[0].length - 2;

    // Create diagonal paths
    // Handle top-left corner
    if (isDiagonalPath(tileType, regionalMap[0][1], regionalMap[1][0])) {
        addPath(getBackSlashPath(pageId, boundingBox.left + TILE_SIZE, boundingBox.top + TILE_SIZE, TILE_SIZE / 2));
    }
    // Handle top-right corner
    if (isDiagonalPath(tileType, regionalMap[0][innerRegionLastColumnIndex], regionalMap[1][innerRegionLastColumnIndex + 1])) {
        addPath(getSlashPath(pageId, boundingBox.right - TILE_SIZE - TILE_SIZE / 2, boundingBox.top + TILE_SIZE, TILE_SIZE / 2));
    }
    // Handle bottom-left corner
    if (isDiagonalPath(tileType, regionalMap[innerRegionLastRowIndex + 1][1], regionalMap[innerRegionLastRowIndex][0])) {
        addPath(getSlashPath(pageId, boundingBox.left + TILE_SIZE, boundingBox.bottom - TILE_SIZE - TILE_SIZE / 2, TILE_SIZE / 2));
    }
    // Handle bottom-right corner
    if (isDiagonalPath(tileType, regionalMap[innerRegionLastRowIndex + 1][innerRegionLastColumnIndex], regionalMap[innerRegionLastRowIndex][innerRegionLastColumnIndex + 1])) {
        addPath(getBackSlashPath(pageId, boundingBox.right - TILE_SIZE - TILE_SIZE / 2, boundingBox.bottom - TILE_SIZE - TILE_SIZE / 2, TILE_SIZE / 2));
    }
}

/**
 * Creates necessary paths connecting the current wall to adjacent ones.
 * 
 * @param boundingBox   BoundingBox of current wall object (inner region).
 * @param tileType      tile type of the current wall object.
 * @param regionalMap   Regional map around the current wall object.
 * @param pageId        ID of the page to add the path to.
 */
createPaths = function (boundingBox, tileType, regionalMap, pageId) {
    createStandardPaths(boundingBox, tileType, regionalMap, pageId);
    createDiagonalPaths(boundingBox, tileType, regionalMap, pageId);
}

getReduntantPaths = function (boundingBox, regionalMap, tileType) {
    pathsParameters = [];
    if (tileType !== TileType.STATIC) {
        return pathsParameters;
    }
    let innerRegionLastRowIndex = regionalMap.length - 2;
    let innerRegionLastColumnIndex = regionalMap[0].length - 2;
    let outerRegionLastRowIndex = regionalMap.length - 1;

    // Check top and bottom rows
    let topRowCenterY = boundingBox.top + TILE_SIZE / 2;
    let bottomRowCenterY = boundingBox.bottom - TILE_SIZE / 2;
    for (let j = 1; j < innerRegionLastColumnIndex; j++) {
        let tileCenterX = boundingBox.left + j * TILE_SIZE + TILE_SIZE / 2;
        // Top row
        // Handle bottom-left slash path
        if (isDiagonalPath(tileType, regionalMap[1][j], regionalMap[0][j - 1])) {
            pathsParameters.push(getSlashPath(pageId, tileCenterX - TILE_SIZE / 2, topRowCenterY, TILE_SIZE / 2));
        }
        // Handle bottom-right backslash path
        if (isDiagonalPath(tileType, regionalMap[1][j], regionalMap[0][j + 1])) {
            pathsParameters.push(getBackSlashPath(pageId, tileCenterX, topRowCenterY, TILE_SIZE / 2));
        }

        // Bottom row
        // Handle top-left backslash path
        if (isDiagonalPath(tileType, regionalMap[innerRegionLastRowIndex][j], regionalMap[outerRegionLastRowIndex][j - 1])) {
            pathsParameters.push(getBackSlashPath(pageId, tileCenterX - TILE_SIZE / 2, bottomRowCenterY - TILE_SIZE / 2, TILE_SIZE / 2));
        }
        // Handle top-right  slash path
        if (isDiagonalPath(tileType, regionalMap[innerRegionLastRowIndex][j], regionalMap[outerRegionLastRowIndex][j + 1])) {
            pathsParameters.push(getSlashPath(pageId, tileCenterX, bottomRowCenterY - TILE_SIZE / 2, TILE_SIZE / 2));
        }
    }

    // Check left and right columns
    // let leftColumnCenterX = boundingBox.left + TILE_SIZE + TILE_SIZE / 2;
    // let rightColumnCenterX = boundingBox.right - (TILE_SIZE + TILE_SIZE / 2);
    // for (let i = 1; i < innerRegionLastRowIndex; i++) {
    //     let tileCenterY = boundingBox.top + i * TILE_SIZE + TILE_SIZE / 2;
    //     addVerticalPath(pageId, leftColumnCenterX, tileCenterY, TILE_SIZE);
    //     if (!isOneColumn) {
    //         addVerticalPath(pageId, rightColumnCenterX, tileCenterY, TILE_SIZE);
    //     }
    // }

    return pathsParameters;
}

insertionCheck = function (graphic) {
    if (graphic.get("layer") !== "objects" && graphic.get("layer") !== "map") {
        return;
    }

    wallTypeAttribute = getWallTypeAttribute(graphic);
    if (!isValidWall(wallTypeAttribute)) {
        return;
    }
    let boundingBox = getBoundingBox(graphic);
    let expandedBoundingBox = expandBoundingBox(boundingBox, TILE_SIZE);
    // log(`expandedBoundingBox: ${expandedBoundingBox}`);
    let pageId = graphic.get("_pageid");
    let overlappingWalls = getWallsOverlappingWithBoundingBox(expandedBoundingBox, pageId);
    log(`overlappingWalls: ${overlappingWalls}`);
    //let pathsInBoundingBox = getPathsInBoundingBox(expandedBoundingBox, pageId);
    // log(`pathsInBoundingBox: ${pathsInBoundingBox}`);
    let regionalMap = getRegionalMap(expandedBoundingBox, overlappingWalls);
    log(`regionalMap: ${prettifyMatrix(regionalMap)}`)
    let tileType = getTileTypeFromWallTypeAttribute(wallTypeAttribute);
    createPaths(expandedBoundingBox, tileType, regionalMap, pageId);
    return;
}

on("ready", function () {
    on("add:token", insertionCheck);
});
// on("change:token", movementCheck);
