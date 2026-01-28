import Order from "../models/orders.js";
import Delivery from "../models/deliveries.js";

/**
 * Récupère toutes les livraisons d'un utilisateur
 */
export const getUserDeliveries = async (request, reply) => {
  try {
    const userId = request.user.id;
    const deliveries = await Delivery.findByUserId(userId);

    // Pour chaque livraison, récupérer les infos de la commande
    const deliveriesWithOrder = await Promise.all(
      deliveries.map(async (delivery) => {
        const order = await Order.findById(delivery.orderId);
        return {
          ...delivery,
          order,
        };
      })
    );

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        deliveries: deliveriesWithOrder,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des livraisons:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des livraisons",
    });
  }
};

/**
 * Récupère une livraison spécifique
 */
export const getDeliveryById = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user.id;

    const delivery = await Delivery.findById(id);
    if (!delivery) {
      return reply.code(404).send({
        success: false,
        message: "Livraison non trouvée",
      });
    }

    // Récupérer la commande associée
    const order = await Order.findById(delivery.orderId);
    if (!order) {
      return reply.code(404).send({
        success: false,
        message: "Commande associée non trouvée",
      });
    }

    // Vérifier que la livraison appartient à l'utilisateur (sauf si admin)
    if (order.userId !== userId.toString() && request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès non autorisé",
      });
    }

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        delivery: {
          ...delivery,
          order,
        },
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de la livraison:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération de la livraison",
    });
  }
};

/**
 * Récupère la livraison d'une commande
 */
export const getDeliveryByOrderId = async (request, reply) => {
  try {
    const { orderId } = request.params;
    const userId = request.user.id;

    // Récupérer la commande
    const order = await Order.findById(orderId);
    if (!order) {
      return reply.code(404).send({
        success: false,
        message: "Commande non trouvée",
      });
    }

    // Vérifier que la commande appartient à l'utilisateur
    if (order.userId !== userId.toString() && request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès non autorisé",
      });
    }

    // Récupérer la livraison
    const delivery = await Delivery.findByOrderId(orderId);

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        delivery: delivery || null,
        order,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de la livraison:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération de la livraison",
    });
  }
};

/**
 * Récupère toutes les livraisons (admin seulement)
 */
export const getAllDeliveries = async (request, reply) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const deliveries = await Delivery.findAllWithOrder();

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        deliveries,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des livraisons:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des livraisons",
    });
  }
};

/**
 * Met à jour le statut d'une livraison (admin seulement)
 */
export const updateDeliveryStatus = async (request, reply) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;
    const { status } = request.body;

    const validStatuses = ["pending", "preparing", "shipped", "in_transit", "delivered", "failed"];
    if (!validStatuses.includes(status)) {
      return reply.code(400).send({
        success: false,
        message: "Statut invalide",
      });
    }

    const delivery = await Delivery.updateStatus(id, status);

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Statut de livraison mis à jour",
      data: {
        delivery,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du statut:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du statut",
    });
  }
};

/**
 * Met à jour le numéro de suivi (admin seulement)
 */
export const updateTracking = async (request, reply) => {
  try {
    // Vérifier que l'utilisateur est admin
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;
    const { trackingNumber, carrier } = request.body;

    if (!trackingNumber) {
      return reply.code(400).send({
        success: false,
        message: "Numéro de suivi requis",
      });
    }

    const delivery = await Delivery.updateTracking(id, trackingNumber, carrier || null);

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Numéro de suivi mis à jour",
      data: {
        delivery,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour du numéro de suivi:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour du numéro de suivi",
    });
  }
};

