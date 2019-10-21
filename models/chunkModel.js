const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ChunkSchema = new Schema({
  key: {
    type: String,
    required: true
  },
  data: {
    type: Object,
    required: false
  },
});

const ChunkModel = mongoose.model('chunks', ChunkSchema);

module.exports = ChunkModel;
