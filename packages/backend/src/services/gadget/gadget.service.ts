import { query, transaction } from '../../config/database';
import {
  Gadget,
  CreateGadgetRequest,
  GadgetStatus,
} from '@gadget-bidding/shared';
import { normalizeMediaPaths } from '@gadget-bidding/shared';
import logger from '../../utils/logger';
import * as notificationService from '../notification/notification.service';

/**
 * Create a new gadget listing
 */
export const createGadget = async (
  sellerId: string,
  data: CreateGadgetRequest
): Promise<Gadget> => {
  const initialStatus: GadgetStatus = 'pending';

  const result = await query(
    `INSERT INTO gadgets
     (seller_id, category_id, title, description, brand, model, condition, specifications, images, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      sellerId,
      data.category_id,
      data.title,
      data.description,
      data.brand || null,
      data.model || null,
      data.condition,
      JSON.stringify(data.specifications || {}),
      normalizeMediaPaths(data.images),
      initialStatus,
    ]
  );

  logger.info(
    `Gadget created: ${result[0].id} by ${sellerId} (status=${initialStatus})`
  );

  notificationService
    .notifyBackofficeGadgetSubmitted(result[0].id, result[0].title)
    .catch(error => {
      logger.error(
        'Failed to notify backoffice about gadget submission:',
        error
      );
    });

  return result[0];
};

/**
 * Get gadget by ID
 */
export const getGadgetById = async (
  gadgetId: string
): Promise<Gadget | null> => {
  const result = await query(
    `SELECT g.*, gc.name as category_name, gc.slug as category_slug,
            u.full_name as seller_name
     FROM gadgets g
     LEFT JOIN gadget_categories gc ON g.category_id = gc.id
     LEFT JOIN users u ON g.seller_id = u.id
     WHERE g.id = $1`,
    [gadgetId]
  );

  return result.length > 0 ? result[0] : null;
};

/**
 * Get gadgets with filters and pagination
 */
export const getGadgets = async (filters: {
  category_id?: string;
  status?: GadgetStatus;
  statuses?: GadgetStatus[];
  seller_id?: string;
  search?: string;
  condition?: string;
  page?: number;
  limit?: number;
}): Promise<{ gadgets: Gadget[]; total: number }> => {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;

  let whereConditions: string[] = [];
  let params: any[] = [];
  let paramIndex = 1;

  // Build WHERE conditions
  if (filters.category_id) {
    whereConditions.push(`g.category_id = $${paramIndex}`);
    params.push(filters.category_id);
    paramIndex++;
  }

  if (filters.status) {
    whereConditions.push(`g.status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  } else if (filters.statuses?.length) {
    whereConditions.push(`g.status = ANY($${paramIndex}::text[])`);
    params.push(filters.statuses);
    paramIndex++;
  }

  if (filters.seller_id) {
    whereConditions.push(`g.seller_id = $${paramIndex}`);
    params.push(filters.seller_id);
    paramIndex++;
  }

  if (filters.condition) {
    whereConditions.push(`g.condition = $${paramIndex}`);
    params.push(filters.condition);
    paramIndex++;
  }

  if (filters.search) {
    whereConditions.push(
      `(g.title ILIKE $${paramIndex} OR g.description ILIKE $${paramIndex} OR g.brand ILIKE $${paramIndex})`
    );
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM gadgets g
    ${whereClause}
  `;

  const countResult = await query(countQuery, params);
  const total = parseInt(countResult[0].total);

  // Get gadgets
  const gadgetsQuery = `
    SELECT g.*, gc.name as category_name, gc.slug as category_slug,
           u.full_name as seller_name
    FROM gadgets g
    LEFT JOIN gadget_categories gc ON g.category_id = gc.id
    LEFT JOIN users u ON g.seller_id = u.id
    ${whereClause}
    ORDER BY g.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const gadgets = await query(gadgetsQuery, [...params, limit, offset]);

  return { gadgets, total };
};

/**
 * Update gadget
 */
export const updateGadget = async (
  gadgetId: string,
  sellerId: string,
  updates: Partial<CreateGadgetRequest>
): Promise<Gadget> => {
  return transaction(async client => {
    // Verify ownership
    const gadgetResult = await client.query(
      'SELECT * FROM gadgets WHERE id = $1 AND seller_id = $2',
      [gadgetId, sellerId]
    );

    if (gadgetResult.rows.length === 0) {
      throw new Error('Gadget not found or unauthorized');
    }

    const gadget = gadgetResult.rows[0];

    // Can only update gadgets that are pending or rejected
    if (gadget.status !== 'pending' && gadget.status !== 'rejected') {
      throw new Error('Can only update pending or rejected gadgets');
    }

    // Build update query
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title) {
      updateFields.push(`title = $${paramIndex}`);
      values.push(updates.title);
      paramIndex++;
    }

    if (updates.description) {
      updateFields.push(`description = $${paramIndex}`);
      values.push(updates.description);
      paramIndex++;
    }

    if (updates.brand !== undefined) {
      updateFields.push(`brand = $${paramIndex}`);
      values.push(updates.brand);
      paramIndex++;
    }

    if (updates.model !== undefined) {
      updateFields.push(`model = $${paramIndex}`);
      values.push(updates.model);
      paramIndex++;
    }

    if (updates.condition) {
      updateFields.push(`condition = $${paramIndex}`);
      values.push(updates.condition);
      paramIndex++;
    }

    if (updates.specifications) {
      updateFields.push(`specifications = $${paramIndex}`);
      values.push(JSON.stringify(updates.specifications));
      paramIndex++;
    }

    if (updates.images) {
      updateFields.push(`images = $${paramIndex}`);
      values.push(updates.images);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    // Reset to pending status when updated
    updateFields.push(`status = 'pending'`);
    updateFields.push(`updated_at = NOW()`);

    values.push(gadgetId, sellerId);

    const updateQuery = `
      UPDATE gadgets
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND seller_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await client.query(updateQuery, values);

    logger.info(`Gadget updated: ${gadgetId}`);

    return result.rows[0];
  });
};

/**
 * Delete gadget (soft delete by setting status)
 */
export const deleteGadget = async (
  gadgetId: string,
  sellerId: string
): Promise<void> => {
  return transaction(async client => {
    // Check if gadget has active auction
    const auctionResult = await client.query(
      `SELECT * FROM auctions WHERE gadget_id = $1 AND status IN ('scheduled', 'active')`,
      [gadgetId]
    );

    if (auctionResult.rows.length > 0) {
      throw new Error('Cannot delete gadget with active auction');
    }

    // Verify ownership and delete
    const result = await client.query(
      'DELETE FROM gadgets WHERE id = $1 AND seller_id = $2 RETURNING id',
      [gadgetId, sellerId]
    );

    if (result.rows.length === 0) {
      throw new Error('Gadget not found or unauthorized');
    }

    logger.info(`Gadget deleted: ${gadgetId}`);
  });
};

/**
 * Approve gadget (admin only)
 */
export const approveGadget = async (gadgetId: string): Promise<Gadget> => {
  const result = await query(
    `UPDATE gadgets
     SET status = 'approved', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [gadgetId]
  );

  if (result.length === 0) {
    throw new Error('Gadget not found or already processed');
  }

  logger.info(`Gadget approved: ${gadgetId}`);

  return result[0];
};

/**
 * Reject gadget (admin only)
 */
export const rejectGadget = async (
  gadgetId: string,
  reason: string
): Promise<Gadget> => {
  const result = await query(
    `UPDATE gadgets
     SET status = 'rejected', rejection_reason = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [gadgetId, reason]
  );

  if (result.length === 0) {
    throw new Error('Gadget not found or already processed');
  }

  logger.info(`Gadget rejected: ${gadgetId}`);

  return result[0];
};

/**
 * Get seller's gadgets
 */
export const getSellerGadgets = async (
  sellerId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ gadgets: Gadget[]; total: number }> => {
  return getGadgets({ seller_id: sellerId, page, limit });
};
