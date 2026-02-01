import pool from "../db.js";
import bcrypt from "bcryptjs";

const mapUser = (row) => {
  if (!row) return null;

  return {
    id: row.id.toString(),
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    zipCode: row.zip_code,
    avatar: row.avatar,
    googleId: row.google_id,
    authProvider: row.auth_provider,
    isVerified: row.is_verified,
    role: row.role,
    isPro: row.is_pro,
    proStatus: row.pro_status,
    verificationMode: row.verification_mode,
    decisionSource: row.decision_source,
    decisionAt: row.decision_at ? row.decision_at.toISOString() : null,
    reviewedByAdminId: row.reviewed_by_admin_id != null ? row.reviewed_by_admin_id.toString() : null,
    lastVerificationError: row.last_verification_error,
    company: row.company_name
      ? {
          name: row.company_name,
          siret: row.company_siret,
          address: row.company_address,
          city: row.company_city,
          zipCode: row.company_zip_code,
          phone: row.company_phone,
          email: row.company_email,
          country: row.company_country,
          vatNumber: row.vat_number,
          vatStatus: row.vat_status || "none",
          vatValidationDate: row.vat_validation_date ? row.vat_validation_date.toISOString() : null,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

class User {
  static async findById(id) {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return mapUser(result.rows[0]);
  }

  static async findByEmail(email) {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase(),
    ]);
    return mapUser(result.rows[0]);
  }

  static async findByGoogleId(googleId) {
    const result = await pool.query(
      "SELECT * FROM users WHERE google_id = $1",
      [googleId]
    );
    return mapUser(result.rows[0]);
  }

  static async create(userData) {
    const hashedPassword = userData.password
      ? await bcrypt.hash(userData.password, 10)
      : null;

    const result = await pool.query(
      `INSERT INTO users (
        email, password, first_name, last_name, phone, address, city, zip_code,
        avatar, google_id, auth_provider, is_verified, role, is_pro, pro_status,
        verification_mode, decision_source, decision_at, reviewed_by_admin_id, last_verification_error,
        company_name, company_siret, company_address, company_city, company_zip_code,
        company_phone, company_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING *`,
      [
        userData.email.toLowerCase(),
        hashedPassword,
        userData.firstName,
        userData.lastName,
        userData.phone || null,
        userData.address || null,
        userData.city || null,
        userData.zipCode || null,
        userData.avatar || null,
        userData.googleId || null,
        userData.authProvider || "local",
        userData.isVerified || false,
        userData.role || "user",
        userData.isPro || false,
        userData.proStatus || "none",
        userData.verificationMode || "auto",
        userData.decisionSource ?? null,
        userData.decisionAt ?? null,
        userData.reviewedByAdminId ?? null,
        userData.lastVerificationError ?? null,
        userData.company?.name || null,
        userData.company?.siret || null,
        userData.company?.address || null,
        userData.company?.city || null,
        userData.company?.zipCode || null,
        userData.company?.phone || null,
        userData.company?.email || null,
      ]
    );
    return mapUser(result.rows[0]);
  }

  static async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const fieldMapping = {
      email: "email",
      password: "password",
      firstName: "first_name",
      lastName: "last_name",
      phone: "phone",
      address: "address",
      city: "city",
      zipCode: "zip_code",
      avatar: "avatar",
      googleId: "google_id",
      authProvider: "auth_provider",
      isVerified: "is_verified",
      role: "role",
      isPro: "is_pro",
      proStatus: "pro_status",
      verificationMode: "verification_mode",
      decisionSource: "decision_source",
      decisionAt: "decision_at",
      reviewedByAdminId: "reviewed_by_admin_id",
      lastVerificationError: "last_verification_error",
    };

    // Mapping pour les champs company
    const companyFieldMapping = {
      name: "company_name",
      siret: "company_siret",
      address: "company_address",
      city: "company_city",
      zipCode: "company_zip_code",
      phone: "company_phone",
      email: "company_email",
      country: "company_country",
      vatNumber: "vat_number",
      vatStatus: "vat_status",
      vatValidationDate: "vat_validation_date",
    };

    for (const [key, value] of Object.entries(updateData)) {
      if (key === "company" && value) {
        // Traiter tous les champs company avec une boucle
        for (const [companyKey, companyValue] of Object.entries(value)) {
          if (companyFieldMapping[companyKey] !== undefined) {
            fields.push(
              `${companyFieldMapping[companyKey]} = $${paramCount++}`
            );
            values.push(companyValue || null);
          }
        }
      } else if (fieldMapping[key]) {
        fields.push(`${fieldMapping[key]} = $${paramCount++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return await this.findById(id);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(
        ", "
      )} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return mapUser(result.rows[0]);
  }

  static async comparePassword(userId, candidatePassword) {
    const result = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [userId]
    );

    if (!result.rows[0] || !result.rows[0].password) {
      return false;
    }

    return await bcrypt.compare(candidatePassword, result.rows[0].password);
  }

  static async findAll() {
    const result = await pool.query(
      "SELECT * FROM users ORDER BY created_at DESC"
    );
    return result.rows.map(mapUser);
  }

  // Méthode pour toJSON (compatibilité avec l'ancien code)
  static toJSON(user) {
    if (!user) return null;
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}

export default User;
