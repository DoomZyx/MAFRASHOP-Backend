import Order from "../../models/orders.js";
import Delivery from "../../models/deliveries.js";

/**
 * Récupérer toutes les commandes avec filtres (admin seulement)
 */
export const getAllOrders = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { status } = request.query;

    let orders;
    if (status && status !== "all") {
      // Filtrer par statut
      orders = await Order.findAllWithUserByStatus(status);
    } else {
      // Toutes les commandes
      orders = await Order.findAllWithUser();
    }

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
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Récupérer une commande par ID avec tous les détails (admin seulement)
 */
export const getOrderById = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;
    const order = await Order.findByIdWithUser(id);

    if (!order) {
      return reply.code(404).send({
        success: false,
        message: "Commande non trouvée",
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
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Mettre à jour le statut d'une commande (admin seulement)
 */
export const updateOrderStatus = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;
    const { status } = request.body;

    // Validation du statut
    const validStatuses = ["pending", "paid", "failed", "cancelled", "refunded", "shipped", "preparing"];
    if (!status || !validStatuses.includes(status)) {
      return reply.code(400).send({
        success: false,
        message: `Statut invalide. Statuts valides: ${validStatuses.join(", ")}`,
      });
    }

    // Vérifier que la commande existe
    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      return reply.code(404).send({
        success: false,
        message: "Commande non trouvée",
      });
    }

    // Mettre à jour le statut
    const updatedOrder = await Order.updateStatus(id, status);

    // Si le statut est "shipped" et qu'une livraison existe, mettre à jour son statut
    if (status === "shipped") {
      const delivery = await Delivery.findByOrderId(id);
      if (delivery) {
        await Delivery.updateStatus(delivery.id, "in_transit");
      }
    }

    // Récupérer les détails complets
    const orderWithDetails = await Order.findByIdWithUser(id);
    const items = await Order.findOrderItems(id);
    const delivery = await Delivery.findByOrderId(id);

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Statut de la commande mis à jour avec succès",
      data: {
        order: {
          ...orderWithDetails,
          items,
          delivery: delivery || null,
        },
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du statut:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du statut",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

