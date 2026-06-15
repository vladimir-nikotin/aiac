import { Module } from '@nestjs/common';

import { ClaudeModule } from '../claude';

import { AgentService } from './agent.service';
import { FactsService } from './fatcs.service';
import { HistoryService } from './history.service';

@Module({
  imports: [ClaudeModule],
  exports: [AgentService],
  providers: [AgentService, FactsService, HistoryService],
})
export class AgentModule {}
