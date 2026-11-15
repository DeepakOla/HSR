import { handle } from '@astrojs/cloudflare/handler';
import { extendFutureSnapshots } from './lib/booking-engine';
import { handleMultiplexedCron } from './lib/cron-multiplexer';
import { parseBankAlertEmail, recordAndAutoReconcileUpiCredit } from './lib/zero-cost-upi';

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === '35 18 * * *') {
      const createdCount = await extendFutureSnapshots(env.DB);
      console.log(`HSR availability horizon extended; new daily slot snapshots: ${createdCount}`);
    }

    const { expiredHolds, reconciledCredits, zohoConsolidated } = await handleMultiplexedCron(env.DB);
    console.log(`HSR multiplexed cron: expiredHolds=${expiredHolds}, reconciledCredits=${reconciledCredits}, zohoConsolidated=${zohoConsolidated}`);
  },

  async email(message: any, env: Env): Promise<void> {
    try {
      const parsedAlert = await parseBankAlertEmail(message.raw);
      if (parsedAlert && env.DB) {
        const result = await recordAndAutoReconcileUpiCredit(env.DB, parsedAlert);
        console.log(`Bank alert parsed: UTR ${parsedAlert.utrNumber}, Reconciled: ${result.reconciled}`);
      }
    } catch (err) {
      console.error('Inbound bank email parse failed:', err);
    }
  }
} satisfies ExportedHandler<Env>;
