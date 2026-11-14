import { handle } from '@astrojs/cloudflare/handler';
import { expireDueHolds, extendFutureSnapshots } from './lib/booking-engine';

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron === '35 18 * * *') {
      const createdCount = await extendFutureSnapshots(env.DB);
      console.log(`HSR availability horizon extended; new daily slot snapshots: ${createdCount}`);
      return;
    }

    const expiredCount = await expireDueHolds(env.DB);
    console.log(`HSR hold cleanup completed; expired unpaid holds: ${expiredCount}`);
  },
} satisfies ExportedHandler<Env>;
