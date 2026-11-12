import { handle } from '@astrojs/cloudflare/handler';
import { expireDueHolds } from './lib/booking-engine';

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handle(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const expiredCount = await expireDueHolds(env.DB);
    console.log(`HSR hold cleanup completed; expired unpaid holds: ${expiredCount}`);
  },
} satisfies ExportedHandler<Env>;
