// reads in our .env file and makes those values available as environment variables
require('dotenv').config();

const ChunkModel = require('./models/chunkModel');
const mongoose = require('mongoose');
var express = require('express');
var ejs = require('ejs');
var bodyParser = require('body-parser');
var zlib = require('zlib');
var request = require('request');
var tilebelt = require('@mapbox/tilebelt');
const vtquery = require('@mapbox/vtquery');

var fs = require('fs');
var masterMapJson = JSON.parse(fs.readFileSync('public/assets/map/master.json', 'utf8'));
console.log(masterMapJson);

// setup mongo connection
const uri = process.env.MONGODB_URI;
mongoose.connect(uri, { useNewUrlParser : true, useCreateIndex: true });
mongoose.connection.on('error', (error) => {
  console.log(error);
  process.exit(1);
});
mongoose.connection.on('connected', function () {
  console.log('connected to mongo');
});
mongoose.set('useFindAndModify', false);

var app = express();
module.exports.app = app;
app.set('port', (process.env.PORT || 5000));
app.engine('html', require('ejs').renderFile);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', function(req, res) {
  return res.render('./index.html');
});

app.use(express.static(__dirname + '/public'));

// async wrappers for callback functions

requestAsync = async function(url, options) {
   return new Promise(
    (resolve, reject) => {
      request.get(url, options, function(err, req_res, body) {  
        if (err) reject(err);
        resolve(body);
      })
    });
}

gunzipAsync = async function(body) {
   return new Promise(
    (resolve, reject) => {
      zlib.gunzip(body, function(err, deflated) {
        if (err) reject(err);
        resolve(deflated);
      })
    })
}

vtqueryAsync = async function(tiles, location, options) {
  return new Promise(
    (resolve, reject) => {
      vtquery(tiles, location, options, function(err, results) {
          if (err) reject(err);
          resolve(results);
      });
    });
}

var zoom = 17;
var chunkWidth = masterMapJson.chunkWidth;
var chunkHeight = masterMapJson.chunkHeight;

// converts a vector tile into a raster of terrain types for the game map

convertVectorTile = async function(deflated, tile) {

  let bbox = tilebelt.tileToBBOX(tile);
  console.log(bbox);
  let lngStep = (bbox[2] - bbox[0]) / chunkWidth;
  let latStep = (bbox[3] - bbox[1]) / chunkHeight;
  console.log(lngStep, latStep);

  let radius = 3;
  let data = [];
  let columns = 0;
  let rows = 0;

  let testTileCounter = 1;

  for(let rowCounter = chunkHeight - 1; rowCounter >= 0; rowCounter--) {
    columns = 0;
    let row = [];
    for(let columnCounter = 0; columnCounter < chunkWidth; columnCounter++) {

      let lng = bbox[0] + columnCounter * lngStep;
      let lat = bbox[1] + rowCounter * latStep;
      //console.log(lng, lat);

      let result = await vtqueryAsync([{buffer: deflated, z: zoom, x: parseInt(tile[0]), y: parseInt(tile[1])}], 
        [parseFloat(lng), parseFloat(lat)], {radius});
      //console.log(result);
      
      let point = 0;

      let features = result.features;
      //console.log(features);
      if(features.length > 0) {
        let water = false;
        let landuse = false;
        let building = false;
        let road = false;
        features.forEach((f)=>{
          if(f.properties.tilequery.layer == "water") water = true
          if(f.properties.tilequery.layer == "landuse"
            || f.properties.type == "park"
            || f.properties.type == "fence"
            ) landuse = true
        
          if(f.properties.type == "building"
            || f.properties.type == "apartments"
            ) building = true
          
          if(f.properties.tilequery.layer == "road-street"
            || f.properties.tilequery.layer == "road"
            || f.properties.tilequery.layer == "road-secondary-tertiary"
            || f.properties.tilequery.layer == "bridge-primary-secondary-tertiary"
            || f.properties.type == "path"
            || f.properties.type == "footway"
            || f.properties.type == "tertiary"
            ) road = true
        });

        if(landuse) {
          point = 173;
          if(Math.random() < 0.2) {
            point = 645;
          }
        } 

        if(water) {
          point = 707;
          if(Math.random() < 0.1) {
            point = 708;
          }
        }

        if(building) {
          point = 414;
        }

        if(road) {
          point = 34;
        }

      }

      if(point == 0) {
        point = 439;
        if(features.length) {
          //console.log("no tile set", features);  
        } else {
          //console.log("no tile set", result);  
        }
        
      }

      data.push(point);
      row.push(point);
      columns++;
    }
    //console.log(row);
    rows++;
  }
  //console.log(columns, rows);

  // extra embellishments

  for(let rowCounter = 0; rowCounter < chunkHeight; rowCounter++) {
    for(let columnCounter = 0; columnCounter < chunkWidth; columnCounter++) {
      
      // find borders between water and something else
      if(rowCounter > 0) {
        if(  (data[rowCounter * chunkWidth + columnCounter] == 707
            || data[rowCounter * chunkWidth + columnCounter] == 708)
          && data[(rowCounter - 1) * chunkWidth + columnCounter] != 707 
          && data[(rowCounter - 1) * chunkWidth + columnCounter] != 708
          && data[(rowCounter - 1) * chunkWidth + columnCounter] != 406
          ) {
            data[rowCounter * chunkWidth + columnCounter] = 406;
        }
      }

      // building borders
      if(rowCounter < chunkHeight - 1) {
        if( data[rowCounter * chunkWidth + columnCounter] == 414 
          && data[(rowCounter +1) * chunkWidth + columnCounter] != 414 
          ) {
            data[rowCounter * chunkWidth + columnCounter] = 452;
        }
      }
    }
  }

  return data;
}

// api 

var mapboxAccessToken = process.env.MAPBOX_ACCESSTOKEN;

app.get('/api', async function(req, res) {
  var z = zoom; //currently forcing z17 in the game
  //var tile = tilebelt.pointToTile(req.query.lng, req.query.lat, z);
  var tileset = 'mapbox.mapbox-streets-v8';
  var x = parseInt(req.query.x) // tile[0];
  var y = parseInt(req.query.y) // tile[1];
  var tile = [x, y, z];
  
  var chunkKey = `${x}/${y}`;
  console.info("chunkKey", chunkKey);

  let chunkData = null;
  let pointData = null;
  let chunk = await ChunkModel.find({ key: chunkKey });
  
  if(chunk.length) {
    
    chunkData = chunk[0].data;
    console.log("reusing old chunk");
  
  } else {

    console.log("creating new chunk");

    var url = `https://api.mapbox.com/v4/${tileset}/${z}/${x}/${y}.vector.pbf?access_token=${mapboxAccessToken}`;
    console.log(url);
    let response = await requestAsync(url, {encoding: null});
    let deflated = await gunzipAsync(response);
    chunkData = await convertVectorTile(deflated, tile);
    ChunkModel.create({
      key: chunkKey,
      data: chunkData
    });

    pointData = await vtqueryAsync([{buffer: deflated, z: zoom, x: x, y: y}], 
        [parseFloat(req.query.lng), parseFloat(req.query.lat)], {radius: 10});
  }

  let chunkObj = 
  { "width": chunkWidth,
    "height": chunkHeight,
    "layers":[
      {
        "data": chunkData,
        "width":chunkWidth,
        "height":chunkHeight,
        "name":"ground",
        "opacity":1,
        "type":"tilelayer",
        "visible":true,
        "x":0,
        "y":0
      }
    ],
    "nextobjectid":1,
    "orientation":"orthogonal",
    "renderorder":"right-down",
    "tiledversion":"1.0.3",
    "tileheight":32,
    "tilewidth":32,
    "type":"map",
    "version":1,
    "id":chunkKey,
    "tilesets":masterMapJson.tilesets
  }

  //console.log(JSON.stringify(chunkObj));
  
  return res.json(chunkObj);    
      
});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
