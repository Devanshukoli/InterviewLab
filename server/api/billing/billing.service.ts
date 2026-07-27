import { db, BillingHistory, UserSubscription, stringToUUID } from '../../db';
import { getSupabaseClient } from '../../services/supabase';
import { logger } from '../../observability';

export class BillingService {
  static async getHistory(userId: string): Promise<BillingHistory[]> {
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('billing_history')
          .select('*')
          .eq('user_id', stringToUUID(userId))
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map(b => ({
            id: b.id,
            userId: b.user_id,
            amount: b.amount,
            currency: b.currency,
            status: b.status,
            description: b.description,
            invoiceUrl: b.invoice_url,
            receiptNumber: b.receipt_number,
            createdAt: b.created_at
          }));
        }
        if (error) {
          logger.warn('🔮 [BillingService] billing_history query returned an error:', error.message);
        }
      } catch (e) {
        logger.warn('🔮 [BillingService] Failed to query billing_history in Supabase:', e);
      }
    }

    return db.billingHistory.filter(b => b.userId === userId);
  }

  static async getSubscription(userId: string): Promise<UserSubscription | null> {
    const supabase = getSupabaseClient();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('user_id', stringToUUID(userId))
          .maybeSingle();

        if (!error && data) {
          const sub: UserSubscription = {
            id: data.id,
            userId: data.user_id,
            plan: data.plan,
            status: data.status,
            currentPeriodStart: data.current_period_start,
            currentPeriodEnd: data.current_period_end,
            createdAt: data.created_at || new Date().toISOString()
          };
          db.subscriptions.set(userId, sub);
          return sub;
        }
        if (error) {
          logger.warn('🔮 [BillingService] user_subscriptions query returned an error:', error.message);
        }
      } catch (e) {
        logger.warn('🔮 [BillingService] Failed to query user_subscriptions in Supabase:', e);
      }
    }

    return db.subscriptions.get(userId) || null;
  }
}
