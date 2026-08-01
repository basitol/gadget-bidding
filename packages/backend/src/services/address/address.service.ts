import { query, transaction } from '../../config/database';
import { ShippingAddress, UserAddress } from '@gadget-bidding/shared';

type AddressInput = ShippingAddress & {
  label?: string;
  is_default?: boolean;
};

const mapAddress = (row: any): UserAddress => ({
  id: row.id,
  user_id: row.user_id,
  label: row.label,
  full_name: row.full_name,
  phone_number: row.phone_number,
  address_line1: row.address_line1,
  address_line2: row.address_line2 || undefined,
  city: row.city,
  state: row.state,
  postal_code: row.postal_code || undefined,
  country: row.country,
  is_default: row.is_default,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const hasAddresses = async (userId: string): Promise<boolean> => {
  const rows = await query<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM user_addresses WHERE user_id = $1) AS exists',
    [userId]
  );
  return Boolean(rows[0]?.exists);
};

export const listAddresses = async (userId: string): Promise<UserAddress[]> => {
  const rows = await query(
    `SELECT *
     FROM user_addresses
     WHERE user_id = $1
     ORDER BY is_default DESC, updated_at DESC, created_at DESC`,
    [userId]
  );
  return rows.map(mapAddress);
};

export const createAddress = async (
  userId: string,
  input: AddressInput
): Promise<UserAddress> => {
  const shouldDefault =
    input.is_default === true || !(await hasAddresses(userId));

  return transaction(async client => {
    if (shouldDefault) {
      await client.query(
        'UPDATE user_addresses SET is_default = false, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );
    }

    const result = await client.query(
      `INSERT INTO user_addresses
       (user_id, label, full_name, phone_number, address_line1, address_line2, city, state, postal_code, country, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        input.label?.trim() || 'Delivery address',
        input.full_name,
        input.phone_number,
        input.address_line1,
        input.address_line2 || null,
        input.city,
        input.state,
        input.postal_code || null,
        input.country || 'Nigeria',
        shouldDefault,
      ]
    );

    return mapAddress(result.rows[0]);
  });
};

export const updateAddress = async (
  userId: string,
  addressId: string,
  input: AddressInput
): Promise<UserAddress> => {
  return transaction(async client => {
    if (input.is_default === true) {
      await client.query(
        'UPDATE user_addresses SET is_default = false, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );
    }

    const result = await client.query(
      `UPDATE user_addresses
       SET label = $3,
           full_name = $4,
           phone_number = $5,
           address_line1 = $6,
           address_line2 = $7,
           city = $8,
           state = $9,
           postal_code = $10,
           country = $11,
           is_default = CASE WHEN $12::boolean THEN true ELSE is_default END,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        addressId,
        userId,
        input.label?.trim() || 'Delivery address',
        input.full_name,
        input.phone_number,
        input.address_line1,
        input.address_line2 || null,
        input.city,
        input.state,
        input.postal_code || null,
        input.country || 'Nigeria',
        input.is_default === true,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Address not found');
    }

    return mapAddress(result.rows[0]);
  });
};

export const deleteAddress = async (
  userId: string,
  addressId: string
): Promise<void> => {
  const result = await query<{ id: string }>(
    'DELETE FROM user_addresses WHERE id = $1 AND user_id = $2 RETURNING id',
    [addressId, userId]
  );

  if (result.length === 0) {
    throw new Error('Address not found');
  }
};

export const setDefaultAddress = async (
  userId: string,
  addressId: string
): Promise<UserAddress> => {
  return transaction(async client => {
    const existing = await client.query(
      'SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2',
      [addressId, userId]
    );
    if (existing.rows.length === 0) {
      throw new Error('Address not found');
    }

    await client.query(
      'UPDATE user_addresses SET is_default = false, updated_at = NOW() WHERE user_id = $1',
      [userId]
    );

    const result = await client.query(
      `UPDATE user_addresses
       SET is_default = true, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [addressId, userId]
    );

    return mapAddress(result.rows[0]);
  });
};
