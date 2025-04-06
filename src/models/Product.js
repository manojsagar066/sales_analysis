const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const productSchema = new Schema({
  _id: { type: String, required: true }, 
  name: { type: String, required: true },
  category: { type: String, required: true, index: true }, 
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
}, { _id: false }); 

module.exports = mongoose.model('Product', productSchema);
