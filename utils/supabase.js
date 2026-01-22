/**
 * Client Supabase pour les requêtes API REST
 */
class SupabaseClient {
  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être configurés");
    }

    this.url = process.env.SUPABASE_URL;
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.baseUrl = `${this.url}/rest/v1`;
  }

  /**
   * Effectue une requête GET
   */
  async get(table, options = {}) {
    const { select = "*", filter = "", order = "", limit = null } = options;
    
    let url = `${this.baseUrl}/${table}?select=${select}`;
    
    if (filter) {
      url += `&${filter}`;
    }
    
    if (order) {
      url += `&order=${order}`;
    }
    
    if (limit) {
      url += `&limit=${limit}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Supabase GET error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    
    // Log pour déboguer (seulement si des données sont retournées)
    if (data && Array.isArray(data) && data.length > 0) {
      const firstItem = data[0];
      if (firstItem.id === undefined || firstItem.id === null) {
        console.error(`Supabase GET ${table}: ID manquant dans les données`);
        console.error(`Structure complète:`, JSON.stringify(firstItem, null, 2));
      }
    } else if (data && Array.isArray(data) && data.length === 0) {
      console.warn(`Supabase GET ${table}: Aucune donnée retournée`);
    }
    
    return data;
  }

  /**
   * Effectue une requête GET par ID
   */
  async getById(table, id, options = {}) {
    const { select = "*" } = options;
    
    const response = await fetch(`${this.baseUrl}/${table}?select=${select}&id=eq.${id}`, {
      method: "GET",
      headers: {
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Supabase GET error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data[0] || null;
  }

  /**
   * Effectue une requête GET par champ personnalisé
   */
  async getByField(table, field, value, options = {}) {
    const { select = "*" } = options;
    
    const response = await fetch(`${this.baseUrl}/${table}?select=${select}&${field}=eq.${value}`, {
      method: "GET",
      headers: {
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Supabase GET error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data[0] || null;
  }

  /**
   * Effectue une requête POST (insert)
   * @param {string} table - Nom de la table
   * @param {object|array} data - Données à insérer (objet unique ou tableau pour batch insert)
   */
  async post(table, data) {
    const isBatch = Array.isArray(data);
    const response = await fetch(`${this.baseUrl}/${table}`, {
      method: "POST",
      headers: {
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Supabase POST error: ${error.message || response.statusText}`);
    }

    const result = await response.json();
    if (isBatch) {
      return result; // Retourne le tableau complet pour les batch inserts
    }
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Effectue une requête PATCH (update)
   */
  async patch(table, id, data) {
    const response = await fetch(`${this.baseUrl}/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Supabase PATCH error: ${error.message || response.statusText}`);
    }

    const result = await response.json();
    return Array.isArray(result) ? result[0] : result;
  }

  /**
   * Effectue une requête DELETE
   */
  async delete(table, id) {
    const response = await fetch(`${this.baseUrl}/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Supabase DELETE error: ${error.message || response.statusText}`);
    }

    return true;
  }

  /**
   * Effectue une requête avec JOIN (via select)
   */
  async getWithJoin(table, joinTable, joinField, options = {}) {
    const { select = "*", filter = "", order = "" } = options;
    
    // Format Supabase pour les JOINs: select=*,join_table(*)
    const selectWithJoin = `${select},${joinTable}(*)`;
    
    let url = `${this.baseUrl}/${table}?select=${selectWithJoin}`;
    
    if (filter) {
      url += `&${filter}`;
    }
    
    if (order) {
      url += `&order=${order}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": this.serviceRoleKey,
        "Authorization": `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Supabase GET error: ${error.message || response.statusText}`);
    }

    return await response.json();
  }
}

// Créer une instance singleton
let supabaseClient = null;

export const getSupabaseClient = () => {
  if (!supabaseClient) {
    try {
      supabaseClient = new SupabaseClient();
    } catch (error) {
      // Si Supabase n'est pas configuré, retourner null
      // Cela permet de basculer entre Supabase et PostgreSQL direct
      console.warn("Supabase non configuré, utilisation de PostgreSQL direct:", error.message);
      return null;
    }
  }
  return supabaseClient;
};

export default getSupabaseClient;

