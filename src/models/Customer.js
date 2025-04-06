const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const customerSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number },
  location: { type: String },
  gender: { type: String },
}, { _id: false });

module.exports = mongoose.model('Customer', customerSchema);
