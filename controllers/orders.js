import Order from "../models/orders.js";
import Delivery from "../models/deliveries.js";

// Récupérer toutes les commandes d'un utilisateur
export const getUserOrders = async (request, reply) => {
  try {
    const userId = request.user.id;
    const orders = await Order.findByUserId(userId);

    // Pour chaque commande, récupérer les items et la livraison
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await Order.findOrderItems(order.id);
        const delivery = await Delivery.findByOrderId(order.id);
        return {
          ...order,
          items,
          delivery: delivery || null,
        };
      })
    );

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        orders: ordersWithItems,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des commandes:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des commandes",
    });
  }
};

// Récupérer une commande spécifique
export const getOrderById = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user.id;

    const order = await Order.findById(id);

    if (!order) {
      return reply.code(404).send({
        success: false,
        message: "Commande non trouvée",
      });
    }

    // Vérifier que la commande appartient à l'utilisateur (sauf si admin)
    if (order.userId !== userId.toString() && request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès non autorisé",
      });
    }

    const items = await Order.findOrderItems(id);
    const delivery = await Delivery.findByOrderId(id);

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        order: {
          ...order,
          items,
          delivery: delivery || null,
        },
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de la commande:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération de la commande",
    });
  }
};

// Récupérer toutes les commandes (admin seulement)
export const getAllOrders = async (request, reply) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const orders = await Order.findAllWithUser();

    // Pour chaque commande, récupérer les items et la livraison
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await Order.findOrderItems(order.id);
        const delivery = await Delivery.findByOrderId(order.id);
        return {
          ...order,
          items,
          delivery: delivery || null,
        };
      })
    );

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        orders: ordersWithItems,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des commandes:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des commandes",
    });
  }
};






