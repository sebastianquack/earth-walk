/**
 * Created by Jerome Renaux (jerome.renaux@gmail.com) on 07-02-18.
 */
var Game = {};

Game.preload = function(){
    Game.scene = this; // Handy reference to the scene (alternative to `this` binding)
    // We will be loading files on the fly, so we need to listen to events triggered when
    // a file (a tilemap, more specifically) is added to the cache
    this.cache.tilemap.events.on('add',function(cache, key){
        Game.displayChunk(key);
    });
    this.load.image('tiles', 'assets/tilesheet.png');
    this.load.image('phaserguy', 'assets/phaserguy.png');
    // This master file contains information about your chunks; see splitter/splitmap.js how it is created
    this.load.json('master', 'assets/map/master.json');

    this.events.on('player-warp', Game.playerWarp);
};

Game.create = function(){
    
    Game.maps = {}; // Maps chunk id's to the corresponding tilemaps; used to be able to destroy them
    Game.displayedChunks = {}; // tracking which chungs are displayed
    var masterData = this.cache.json.get('master');
    console.log(masterData);
    Game.chunkWidth = masterData.chunkWidth;
    Game.chunkHeight = masterData.chunkHeight;
    /*Game.nbChunksHorizontal = masterData.nbChunksHorizontal;
    Game.nbChunksVertical = masterData.nbChunksVertical;
    Game.lastChunkID = (Game.nbChunksHorizontal*Game.nbChunksVertical)-1;*/

    Game.camera = this.cameras.main;
    //var worldWidth = masterData.nbChunksHorizontal*masterData.chunkWidth; // width of the world in tiles
    //var worldHeight = masterData.nbChunksVertical*masterData.chunkHeight; // height of the world in tiles
    //Game.camera.setBounds(0, 0, worldWidth*32, worldHeight*32);
    Game.phaserGuy = this.add.image(250,250,'phaserguy');
    Game.phaserGuy.setDepth(1); // So that the ground layer of the newly drawn chunks is not drawn on top of our guy
    Game.phaserGuy.setOrigin(0.5, 1);
    Game.phaserGuy.visible = false;
    Game.camera.startFollow(Game.phaserGuy);
    Game.player = Game.phaserGuy;

    this.cursors = this.input.keyboard.createCursorKeys();
};

Game.update = function() {
      let offsetX = 0;
      let offsetY = 0;
      let step = 5;
    
      // Horizontal movement
      if (this.cursors.left.isDown) {
        offsetX = -step;
      } else if (this.cursors.right.isDown) {
        offsetX = step;
      }

      // Vertical movement
      if (this.cursors.up.isDown) {
        offsetY = -step;
      } else if (this.cursors.down.isDown) {
        offsetY = step;
      }

      if(offsetX || offsetY) {
        let newX = Game.player.x + offsetX;
        let newY = Game.player.y + offsetY;

        let chunkId = Game.computeChunkID(newX, newY);
        let tile = Game.maps[chunkId].getTileAtWorldXY(newX, newY);
        //if(tile) console.log(tile.index);

        // don't go in water
        if(!tile || !(tile.index == 707 || tile.index == 708 || tile.index == 406 || tile.index == 452 || tile.index == 414)) {
          Game.player.setPosition(newX, newY);  
          Game.updateEnvironment();
        }
        
      }

}

// copied from tilebelt
// https://github.com/mapbox/tilebelt/blob/master/index.js
var d2r = Math.PI / 180,
    r2d = 180 / Math.PI;
function pointToTile(lon, lat, z) {
    var tile = pointToTileFraction(lon, lat, z);
    tile[0] = Math.floor(tile[0]);
    tile[1] = Math.floor(tile[1]);
    return tile;
}
function pointToTileFraction(lon, lat, z) {
  var sin = Math.sin(lat * d2r),
      z2 = Math.pow(2, z),
      x = z2 * (lon / 360 + 0.5),
      y = z2 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
  x = x % z2
  if (x < 0) x = x + z2
  return [x, y, z];
}
function tileToBBOX(tile) {
    var e = tile2lon(tile[0] + 1, tile[2]);
    var w = tile2lon(tile[0], tile[2]);
    var s = tile2lat(tile[1] + 1, tile[2]);
    var n = tile2lat(tile[1], tile[2]);
    return [w, s, e, n];
}
function tile2lon(x, z) {
    return x / Math.pow(2, z) * 360 - 180;
}

function tile2lat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return r2d * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

Game.playerWarp = function(lng, lat) {
  console.log("warp to", lng, lat);

  var tile = pointToTile(parseFloat(lng), parseFloat(lat), 17);
  console.log(tile);
  var query = `/api?x=${tile[0]}&y=${tile[1]}`;
  chunkId = tile[0] + "/" + tile[1];
  console.log("chunkId", chunkId);
  Game.originChunkId = chunkId;

  var fractions = pointToTileFraction(parseFloat(lng), parseFloat(lat), 17);
  var xFraction = fractions[0] - tile[0];
  var yFraction = fractions[1] - tile[1];
  
  Game.player.setPosition(xFraction * Game.chunkWidth * 32, yFraction * Game.chunkHeight * 32);  
  
  Game.phaserGuy.visible = true;
  Game.updateEnvironment();

}

// Determines the ID of the chunk on which the player charachter is based on its coordinates in the world
Game.computeChunkID = function(x,y){
    let originChunkIdComponents = Game.originChunkId.split("/");
    originTileX = parseInt(originChunkIdComponents[0]);
    originTileY = parseInt(originChunkIdComponents[1]);

    //console.log("originChunkIdCompomnents", originChunkIdComponents);

    var chunkXFraction = parseInt(x)/(Game.chunkWidth * 32);
    var chunkYFraction = parseInt(y)/(Game.chunkHeight * 32);
    
    //console.log(chunkXFraction, chunkYFraction);

    placeMarker(
      tile2lon(originTileX + chunkXFraction, 17), 
      tile2lat(originTileY + chunkYFraction, 17)
    );

    let id = (originTileX + Math.floor(chunkXFraction)) + "/" + (originTileY + Math.floor(chunkYFraction));
    //console.log("computeChunkID", id);
    return id;
};

// Returns the list of chunks surrounding a specific chunk, taking the world borders into
// account. If you find a smarter way to do it, I'm interested!
Game.listAdjacentChunks = function(chunkId){
    let components = chunkId.split("/");
    let x = parseInt(components[0]);
    let y = parseInt(components[1]);

    var chunks = [];
    chunks.push(chunkId);
    chunks.push((x-1) + "/" + (y-1));
    chunks.push((x-1) + "/" + y);
    chunks.push((x-1) + "/" + (y+1));
    chunks.push(x + "/" + (y-1));
    chunks.push(x + "/" + (y+1));
    chunks.push((x+1) + "/" + (y-1));
    chunks.push((x+1) + "/" + y);
    chunks.push((x+1) + "/" + (y+1));
    return chunks;
};

Game.updateEnvironment = function(){
    var chunkId = Game.computeChunkID(Game.player.x,Game.player.y);
    var chunks = Game.listAdjacentChunks(chunkId); // List the id's of the chunks surrounding the one we are in
    
    var newChunks = Game.findDiffArrayElements(chunks, Object.keys(Game.displayedChunks)); // Lists the surrounding chunks that are not displayed yet (and have to be)
    var oldChunks = Game.findDiffArrayElements(Object.keys(Game.displayedChunks), chunks); // Lists the surrounding chunks that are still displayed (and shouldn't anymore)

    //console.log(newChunks, oldChunks);

    newChunks.forEach(function(c){
        //console.log('loading chunk '+c);
        var components = c.split("/");
        var query = `/api?x=${components[0]}&y=${components[1]}`;
        if(Game.scene.cache.tilemap.has(c)) {
          console.log("using from cache");
          Game.displayChunk(c);
        } else {
          Game.scene.load.tilemapTiledJSON(c, query);  
        }
        
    });
    if(newChunks.length > 0) Game.scene.load.start(); // Needed to trigger loads from outside of preload()

    oldChunks.forEach(c=>{
      Game.removeChunk(c);
    });
};

// Returns the entries in secondArray that are not present in firstArray
Game.findDiffArrayElements = function(firstArray,secondArray){
    return firstArray.filter(function(i) {return secondArray.indexOf(i) < 0;});
};

Game.displayChunk = function(key){
    //console.log("displayChunk", key);

    var map = Game.scene.make.tilemap({ key: key});

    // The first parameter is the name of the tileset in Tiled and the second parameter is the key
    // of the tileset image used when loading the file in preload.
    var tiles = map.addTilesetImage('tilesheet', 'tiles');

    // We need to compute the position of the chunk in the world

    let originChunkComponents = Game.originChunkId.split("/");
    let chunkComponents = key.split("/");

    var chunkX = (parseInt(chunkComponents[0]) - parseInt(originChunkComponents[0])) * Game.chunkWidth;
    var chunkY = (parseInt(chunkComponents[1]) - parseInt(originChunkComponents[1])) * Game.chunkHeight;

    for(var i = 0; i < map.layers.length; i++) {
        // You can load a layer from the map using the layer name from Tiled, or by using the layer
        // index
        var layer = map.createStaticLayer(i, tiles, chunkX*32, chunkY*32);
        // Trick to automatically give different depths to each layer while avoid having a layer at depth 1 (because depth 1 is for our player character)
        layer.setDepth(2*i);
    }

    Game.maps[key] = map;
    Game.displayedChunks[key] = true;;
    //console.log("displayChunk", Game.displayedChunks);
};

Game.removeChunk = function(chunkID){
    Game.maps[chunkID].destroy();
    delete Game.displayedChunks[chunkID];
    Game.scene.cache.tilemap.remove(chunkID); // comment out to leave in cache
};


/**
 * Created by Jerome Renaux (jerome.renaux@gmail.com) on 07-02-18.
 */
var config = {
    type: Phaser.AUTO,
    width: 500,
    height: 500,
    parent: 'game',
    scene: [Game]
};

var game = new Phaser.Game(config);
