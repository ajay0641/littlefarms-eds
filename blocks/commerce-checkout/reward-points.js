import { CORE_FETCH_GRAPHQL } from '../../scripts/commerce.js';

const CHECKOUT_REWARD_POINTS_QUERY = `
  query CheckoutRewardPoints($cartId: String!) {
    customer {
      reward_points {
        balance {
          points
          money {
            value
            currency
          }
        }
      }
    }
    cart(cart_id: $cartId) {
      applied_reward_points {
        points
        money {
          value
          currency
        }
      }
    }
  }
`;

const APPLY_REWARD_POINTS_MUTATION = `
  mutation ApplyRewardPoints($cartId: ID!) {
    applyRewardPointsToCart(cartId: $cartId) {
      cart {
        applied_reward_points {
          points
          money {
            value
            currency
          }
        }
        prices {
          grand_total {
            value
            currency
          }
        }
      }
    }
  }
`;

const REMOVE_REWARD_POINTS_MUTATION = `
  mutation RemoveRewardPoints($cartId: ID!) {
    removeRewardPointsFromCart(cartId: $cartId) {
      cart {
        applied_reward_points {
          points
          money {
            value
            currency
          }
        }
        prices {
          grand_total {
            value
            currency
          }
        }
      }
    }
  }
`;

/**
 * Converts GraphQL errors into a user-facing Error.
 * @param {Array<{message?: string}>|undefined} errors
 */
function throwGraphQlErrors(errors) {
  if (!errors?.length) return;
  throw new Error(errors.map(({ message }) => message).filter(Boolean).join(' '));
}

/** Applied loyalty currently on the cart. Cart drop-in has no reward fields. */
let appliedRewardPoints = null;

/**
 * Returns the loyalty points currently applied to the checkout cart, if any.
 * @returns {{points?: number, money?: {value?: number, currency?: string}}|null}
 */
export function getAppliedRewardPoints() {
  return appliedRewardPoints;
}

/**
 * Stores applied loyalty so Order Summary can render a voucher-style discount row.
 * @param {Object|null|undefined} applied
 * @returns {Object|null}
 */
export function setAppliedRewardPoints(applied) {
  const points = Number(applied?.points || 0);
  appliedRewardPoints = points > 0 ? applied : null;
  return appliedRewardPoints;
}

/**
 * Gets the signed-in customer's balance and the points currently applied to the cart.
 * @param {string} cartId
 * @returns {Promise<{balance: Object|null, applied: Object|null}>}
 */
export async function getCheckoutRewardPoints(cartId) {
  const { data, errors } = await CORE_FETCH_GRAPHQL.fetchGraphQl(
    CHECKOUT_REWARD_POINTS_QUERY,
    {
      method: 'GET',
      cache: 'no-cache',
      variables: { cartId },
    },
  );
  throwGraphQlErrors(errors);

  return {
    balance: data?.customer?.reward_points?.balance ?? null,
    applied: data?.cart?.applied_reward_points ?? null,
  };
}

/**
 * Applies the maximum eligible reward points to the customer cart.
 * @param {string} cartId
 * @returns {Promise<Object|null>}
 */
export async function applyRewardPoints(cartId) {
  const { data, errors } = await CORE_FETCH_GRAPHQL.fetchGraphQl(
    APPLY_REWARD_POINTS_MUTATION,
    {
      method: 'POST',
      variables: { cartId },
    },
  );
  throwGraphQlErrors(errors);
  return data?.applyRewardPointsToCart?.cart ?? null;
}

/**
 * Removes all reward points from the customer cart.
 * @param {string} cartId
 * @returns {Promise<Object|null>}
 */
export async function removeRewardPoints(cartId) {
  const { data, errors } = await CORE_FETCH_GRAPHQL.fetchGraphQl(
    REMOVE_REWARD_POINTS_MUTATION,
    {
      method: 'POST',
      variables: { cartId },
    },
  );
  throwGraphQlErrors(errors);
  return data?.removeRewardPointsFromCart?.cart ?? null;
}
