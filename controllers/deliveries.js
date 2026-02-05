import Order from "../models/orders.js";
import Delivery from "../models/deliveries.js";
import User from "../models/user.js";

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
 * Récupère toutes les livraisons avec commande complète (adresse, client) pour le livreur (admin seulement)
 */
export const getAllDeliveries = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const deliveries = await Delivery.findAllWithOrder();
    const deliveriesWithOrder = await Promise.all(
      deliveries.map(async (d) => {
        const order = await Order.findByIdWithUser(d.orderId);
        let deliveryAddress = null;
        let clientPhone = null;
        if (order?.userId) {
          const user = await User.findById(order.userId);
          if (user) {
            clientPhone = user.phone || (user.company?.phone ?? null);
            if (order.isPro && user.company) {
              deliveryAddress = {
                name: user.company.name || `${user.firstName || ""} ${user.lastName || ""}`.trim(),
                line1: user.company.address || "",
                line2: null,
                postal_code: user.company.zipCode || "",
                city: user.company.city || "",
                country: user.company.country || "France",
              };
            } else {
              deliveryAddress = {
                name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
                line1: user.address || "",
                line2: null,
                postal_code: user.zipCode || "",
                city: user.city || "",
                country: "France",
              };
            }
          }
        }
        return { ...d, order: order || null, deliveryAddress, clientPhone };
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
 * Met à jour le statut d'une livraison (admin seulement).
 * Si statut = "delivered", enregistre aussi la date de livraison réelle (aujourd'hui).
 */
export const updateDeliveryStatus = async (request, reply) => {
  try {
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

    let delivery;
    if (status === "delivered") {
      const today = new Date().toISOString().split("T")[0];
      delivery = await Delivery.updateActualDeliveryDate(id, today);
    } else {
      delivery = await Delivery.updateStatus(id, status);
    }

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

/**
 * Met à jour la date et heure de livraison programmée (admin seulement)
 */
export const updateScheduledDeliveryDateTime = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { id } = request.params;
    const { scheduledDeliveryDateTime } = request.body;

    // Vérifier que la livraison existe
    const existingDelivery = await Delivery.findById(id);
    if (!existingDelivery) {
      return reply.code(404).send({
        success: false,
        message: "Livraison non trouvée",
      });
    }

    // Valider le format de la date/heure si fournie
    if (scheduledDeliveryDateTime !== null && scheduledDeliveryDateTime !== undefined) {
      const date = new Date(scheduledDeliveryDateTime);
      if (isNaN(date.getTime())) {
        return reply.code(400).send({
          success: false,
          message: "Format de date/heure invalide",
        });
      }
    }

    const delivery = await Delivery.updateScheduledDeliveryDateTime(
      id,
      scheduledDeliveryDateTime || null
    );

    reply.type("application/json");
    return reply.send({
      success: true,
      message: "Date et heure de livraison mises à jour",
      data: {
        delivery,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la date/heure de livraison:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la mise à jour de la date/heure de livraison",
    });
  }
};

