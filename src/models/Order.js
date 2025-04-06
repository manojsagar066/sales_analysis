const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderItemSchema = new Schema({
  productId: { type: String, required: true, ref: 'Product' },
  quantity: { type: Number, required: true },
  priceAtPurchase: { type: Number, required: true },
}, { _id: false });

const orderSchema = new Schema({
  _id: { type: String, required: true }, 
  customerId: { type: String, required: true, ref: 'Customer', index: true }, 
  products: [orderItemSchema],
  totalAmount: { type: Number, required: true },
  orderDate: { type: Date, required: true, index: true },
  status: { type: String, required: true, index: true, enum: ['pending', 'completed', 'canceled'] },
}, { _id: false, timestamps: false }); 

// Compound index for sales analytics query
orderSchema.index({ status: 1, orderDate: 1 });

module.exports = mongoose.model('Order', orderSchema);