import { Module } from '@nestjs/common';

import { ClaudeModule } from '../claude';

import { AgentService } from './agent.service';
import { HistoryService } from './history.service';

@Module({
  imports: [ClaudeModule],
  exports: [AgentService],
  providers: [AgentService, HistoryService],
})
export class AgentModule {}
