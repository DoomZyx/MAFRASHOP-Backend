import pool from "../db.js";

// Mapper une facture
const mapInvoice = (row) => {
  if (!row) return null;
  return {
    id: row.id.toString(),
    orderId: row.order_id.toString(),
    invoiceNumber: row.invoice_number,
    status: row.status,
    pdfPath: row.pdf_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

class Invoice {
  // Générer un numéro de facture unique (format: FACT-YYYY-NNNN)
  static async generateInvoiceNumber() {
    const year = new Date().getFullYear();
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM invoices 
       WHERE invoice_number LIKE $1`,
      [`FACT-${year}-%`]
    );
    const count = parseInt(result.rows[0].count, 10);
    const number = String(count + 1).padStart(4, "0");
    return `FACT-${year}-${number}`;
  }

  // Créer une facture depuis une commande
  static async createFromOrder(orderId) {
    const invoiceNumber = await this.generateInvoiceNumber();
    
    const result = await pool.query(
      `INSERT INTO invoices (order_id, invoice_number, status, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [orderId, invoiceNumber, "paid"]
    );

    return mapInvoice(result.rows[0]);
  }

  // Trouver une facture par ID
  static async findById(id) {
    const result = await pool.query("SELECT * FROM invoices WHERE id = $1", [id]);
    return mapInvoice(result.rows[0]);
  }

  // Trouver une facture par order_id
  static async findByOrderId(orderId) {
    const result = await pool.query(
      "SELECT * FROM invoices WHERE order_id = $1",
      [orderId]
    );
    return mapInvoice(result.rows[0]);
  }

  // Trouver une facture par numéro
  static async findByInvoiceNumber(invoiceNumber) {
    const result = await pool.query(
      "SELECT * FROM invoices WHERE invoice_number = $1",
      [invoiceNumber]
    );
    return mapInvoice(result.rows[0]);
  }

  // Trouver toutes les factures d'un utilisateur (via order_id)
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT i.* FROM invoices i
       INNER JOIN orders o ON i.order_id = o.id
       WHERE o.user_id = $1
       ORDER BY i.created_at DESC`,
      [userId]
    );
    return result.rows.map(mapInvoice);
  }

  // Trouver toutes les factures des commandes payées pour un mois/année donnés (date de création de la commande)
  static async findByMonthYear(month, year) {
    const result = await pool.query(
      `SELECT i.* FROM invoices i
       INNER JOIN orders o ON i.order_id = o.id
       WHERE o.status = $1
         AND EXTRACT(MONTH FROM o.created_at) = $2
         AND EXTRACT(YEAR FROM o.created_at) = $3
       ORDER BY i.invoice_number`,
      ["paid", month, year]
    );
    return result.rows.map(mapInvoice);
  }

  // Mettre à jour le chemin du PDF
  static async updatePdfPath(id, pdfPath) {
    const result = await pool.query(
      `UPDATE invoices 
       SET pdf_path = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [pdfPath, id]
    );
    return mapInvoice(result.rows[0]);
  }

  // Mettre à jour le statut
  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE invoices 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );
    return mapInvoice(result.rows[0]);
  }
}

export default Invoice;

