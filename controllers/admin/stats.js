import Order from "../../models/orders.js";
import Product from "../../models/products.js";
import User from "../../models/user.js";
import "../../loadEnv.js";
import pg from "pg";

const { Pool } = pg;

const parseDatabaseUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || "5432", 10),
      database: parsed.pathname.slice(1),
      user: parsed.username,
      password: parsed.password,
    };
  } catch (error) {
    return null;
  }
};

const dbConfig = process.env.DATABASE_URL
  ? parseDatabaseUrl(process.env.DATABASE_URL)
  : {
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD,
    };

if (!dbConfig || !dbConfig.database) {
  throw new Error("Configuration de base de données manquante");
}

const pool = new Pool(dbConfig);

/**
 * Récupérer toutes les statistiques
 */
export const getAllStats = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { period = "all" } = request.query; // all, today, week, month, year

    // Construire la clause WHERE pour la période
    let periodCondition = "";
    const periodParams = [];
    let paramIndex = 1;

    if (period === "today") {
      periodCondition = "DATE(o.created_at) = CURRENT_DATE";
    } else if (period === "week") {
      periodCondition = "o.created_at >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === "month") {
      periodCondition = "o.created_at >= CURRENT_DATE - INTERVAL '30 days'";
    } else if (period === "year") {
      periodCondition = "o.created_at >= CURRENT_DATE - INTERVAL '365 days'";
    }

    // Construire la clause WHERE complète
    const whereClause = periodCondition
      ? `WHERE ${periodCondition} AND o.status = 'paid'`
      : "WHERE o.status = 'paid'";

    // Chiffre d'affaires total
    const revenueResult = await pool.query(
      `SELECT 
        COALESCE(SUM(o.total_amount), 0) as total_revenue,
        COUNT(*) as total_orders,
        COALESCE(AVG(o.total_amount), 0) as avg_order_value
      FROM orders o
      ${whereClause}`,
      periodParams
    );

    const revenue = {
      total: parseFloat(revenueResult.rows[0].total_revenue || 0) / 100, // Convertir de centimes en euros
      totalOrders: parseInt(revenueResult.rows[0].total_orders || 0, 10),
      avgOrderValue: parseFloat(revenueResult.rows[0].avg_order_value || 0) / 100,
    };

    // Chiffre d'affaires par période (derniers 12 mois)
    const revenueByPeriodResult = await pool.query(
      `SELECT 
        DATE_TRUNC('month', o.created_at) as month,
        COALESCE(SUM(o.total_amount), 0) as revenue,
        COUNT(*) as orders_count
      FROM orders o
      WHERE o.status = 'paid'
        AND o.created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', o.created_at)
      ORDER BY month ASC`
    );

    const revenueByPeriod = revenueByPeriodResult.rows.map((row) => ({
      month: row.month.toISOString().substring(0, 7), // Format YYYY-MM
      revenue: parseFloat(row.revenue || 0),
      ordersCount: parseInt(row.orders_count || 0, 10),
    }));

    // Produits les plus vendus
    const bestsellersWhere = periodCondition
      ? `WHERE ${periodCondition} AND o.status = 'paid'`
      : "WHERE o.status = 'paid'";
    const bestsellersResult = await pool.query(
      `SELECT 
        p.id,
        p.nom,
        p.ref,
        p.url_image,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.quantity * oi.unit_price) as total_revenue
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      INNER JOIN products p ON oi.product_id = p.id
      ${bestsellersWhere}
      GROUP BY p.id, p.nom, p.ref, p.url_image
      ORDER BY total_quantity DESC
      LIMIT 10`,
      periodParams
    );

    const bestsellers = bestsellersResult.rows.map((row) => ({
      id: row.id.toString(),
      nom: row.nom,
      ref: row.ref,
      url_image: row.url_image,
      totalQuantity: parseInt(row.total_quantity || 0, 10),
      totalRevenue: parseFloat(row.total_revenue || 0),
    }));

    // Commandes par statut
    const ordersByStatusWhere = periodCondition
      ? `WHERE ${periodCondition}`
      : "";
    const ordersByStatusResult = await pool.query(
      `SELECT 
        o.status,
        COUNT(*) as count,
        COALESCE(SUM(o.total_amount), 0) as total_amount
      FROM orders o
      ${ordersByStatusWhere}
      GROUP BY o.status
      ORDER BY count DESC`,
      periodParams
    );

    const ordersByStatus = ordersByStatusResult.rows.map((row) => ({
      status: row.status,
      count: parseInt(row.count || 0, 10),
      totalAmount: parseFloat(row.total_amount || 0) / 100,
    }));

    // Clients actifs vs nouveaux
    const clientsResult = await pool.query(
      `SELECT 
        COUNT(DISTINCT CASE 
          WHEN EXISTS (
            SELECT 1 FROM orders o2 
            WHERE o2.user_id = u.id 
            AND o2.status = 'paid'
            AND o2.created_at >= CURRENT_DATE - INTERVAL '30 days'
          ) THEN u.id 
        END) as active_clients,
        COUNT(DISTINCT CASE 
          WHEN u.created_at >= CURRENT_DATE - INTERVAL '30 days' THEN u.id 
        END) as new_clients,
        COUNT(DISTINCT CASE 
          WHEN EXISTS (
            SELECT 1 FROM orders o3 
            WHERE o3.user_id = u.id 
            AND o3.status = 'paid'
          ) THEN u.id 
        END) as total_clients_with_orders
      FROM users u`
    );

    const clients = {
      active: parseInt(clientsResult.rows[0].active_clients || 0, 10),
      new: parseInt(clientsResult.rows[0].new_clients || 0, 10),
      totalWithOrders: parseInt(clientsResult.rows[0].total_clients_with_orders || 0, 10),
    };

    // Chiffre d'affaires par produit (top 10)
    const revenueByProductWhere = periodCondition
      ? `WHERE ${periodCondition} AND o.status = 'paid'`
      : "WHERE o.status = 'paid'";
    const revenueByProductResult = await pool.query(
      `SELECT 
        p.id,
        p.nom,
        p.ref,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) as revenue
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      INNER JOIN products p ON oi.product_id = p.id
      ${revenueByProductWhere}
      GROUP BY p.id, p.nom, p.ref
      ORDER BY revenue DESC
      LIMIT 10`,
      periodParams
    );

    const revenueByProduct = revenueByProductResult.rows.map((row) => ({
      id: row.id.toString(),
      nom: row.nom,
      ref: row.ref,
      revenue: parseFloat(row.revenue || 0),
    }));

    reply.type("application/json");
    return reply.send({
      success: true,
      data: {
        revenue,
        revenueByPeriod,
        revenueByProduct,
        bestsellers,
        ordersByStatus,
        clients,
        period,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de la récupération des statistiques",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Exporter les statistiques en CSV
 */
export const exportStatsCSV = async (request, reply) => {
  try {
    if (request.user.role !== "admin") {
      return reply.code(403).send({
        success: false,
        message: "Accès réservé aux administrateurs",
      });
    }

    const { type = "orders" } = request.query; // orders, products, clients

    let csv = "";
    let filename = "";

    if (type === "orders") {
      // Export des commandes
      const ordersResult = await pool.query(
        `SELECT 
          o.id,
          o.status,
          o.total_amount,
          o.created_at,
          u.email,
          u.first_name,
          u.last_name
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.status = 'paid'
        ORDER BY o.created_at DESC`
      );

      csv = "ID,Statut,Montant (€),Date,Email,Prénom,Nom\n";
      ordersResult.rows.forEach((row) => {
        csv += `${row.id},${row.status},${(row.total_amount / 100).toFixed(2)},${row.created_at.toISOString()},${row.email || ""},${row.first_name || ""},${row.last_name || ""}\n`;
      });

      filename = `commandes_${new Date().toISOString().split("T")[0]}.csv`;
    } else if (type === "products") {
      // Export des produits vendus
      const productsResult = await pool.query(
        `SELECT 
          p.id,
          p.nom,
          p.ref,
          SUM(oi.quantity) as total_quantity,
          SUM(oi.quantity * oi.unit_price) as total_revenue
        FROM order_items oi
        INNER JOIN orders o ON oi.order_id = o.id
        INNER JOIN products p ON oi.product_id = p.id
        WHERE o.status = 'paid'
        GROUP BY p.id, p.nom, p.ref
        ORDER BY total_quantity DESC`
      );

      csv = "ID,Nom,Référence,Quantité vendue,Chiffre d'affaires (€)\n";
      productsResult.rows.forEach((row) => {
        csv += `${row.id},"${row.nom}",${row.ref},${row.total_quantity},${(row.total_revenue / 100).toFixed(2)}\n`;
      });

      filename = `produits_${new Date().toISOString().split("T")[0]}.csv`;
    } else if (type === "clients") {
      // Export des clients
      const clientsResult = await pool.query(
        `SELECT 
          u.id,
          u.email,
          u.first_name,
          u.last_name,
          u.created_at,
          COUNT(DISTINCT o.id) as orders_count,
          COALESCE(SUM(o.total_amount), 0) as total_spent
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid'
        GROUP BY u.id, u.email, u.first_name, u.last_name, u.created_at
        ORDER BY total_spent DESC`
      );

      csv = "ID,Email,Prénom,Nom,Date d'inscription,Nombre de commandes,Total dépensé (€)\n";
      clientsResult.rows.forEach((row) => {
        csv += `${row.id},"${row.email}","${row.first_name || ""}","${row.last_name || ""}",${row.created_at.toISOString()},${row.orders_count},${(row.total_spent / 100).toFixed(2)}\n`;
      });

      filename = `clients_${new Date().toISOString().split("T")[0]}.csv`;
    }

    reply.type("text/csv");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(csv);
  } catch (error) {
    console.error("Erreur lors de l'export CSV:", error);
    reply.type("application/json");
    return reply.code(500).send({
      success: false,
      message: "Erreur lors de l'export CSV",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

