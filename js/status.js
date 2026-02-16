import { subscribeOrder } from './api.js';
import { mapStatusToText } from '../components/statusUI.js';

let unsubscribe = null;

export function listenOrderStatus(orderId) {
  const badge = document.getElementById('status-badge');
  const driver = document.getElementById('status-driver');
  const orderIdNode = document.getElementById('status-order-id');

  if (unsubscribe) unsubscribe();

  orderIdNode.textContent = `Order ID: ${orderId}`;
  unsubscribe = subscribeOrder(orderId, (order) => {
    if (!order) {
      badge.innerHTML = '<span class="dot"></span><span>Order tidak ditemukan</span>';
      return;
    }

    badge.innerHTML = `<span class="dot"></span><span>${mapStatusToText(order.status)}</span>`;
    driver.textContent = `Driver: ${order.driverId ?? 'Belum ada'}`;
  });
}
