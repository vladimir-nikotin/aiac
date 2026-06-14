import { Injectable } from '@nestjs/common';

import {
  ClaudeService,
  ClaudeStopReason,
  ClaudeTextContent,
  Message,
} from '../claude';
import { DeepReadonly } from '../types';
import { HistoryService, isSummaryRO } from './history.service';
import { COMPRESSION_SYSTEM_CODE, COMPRESSION_USER_CODE } from './prompts';

export enum ContextStrategy {
  Full = 'full',
  Summarize = 'summ',
}
export type AgentServiceRequestParams = {
  contextStrategy?: ContextStrategy;
  conversations?: number;
  model?: string;
  stopSequences: string[];
  temperature?: number;
};
type AgentServiceRequest = AgentServiceRequestParams & {
  model: string;
  question: string;
};
export type TokenUsage = {
  input: number;
  output: number;
};
export type AgentServiceResponse = {
  answer: string;
  reason: ClaudeStopReason;
  sequence: string | null;
  total: TokenUsage;
  usage: TokenUsage;
};

@Injectable()
export class AgentService {
  constructor(
    private readonly claude: ClaudeService,
    private readonly history: HistoryService,
  ) {}

  async ask({
    contextStrategy = ContextStrategy.Full,
    conversations = 20,
    model,
    question,
    stopSequences,
    temperature,
  }: AgentServiceRequest): Promise<AgentServiceResponse> {
    const message: Message = {
      content: [
        {
          text: question,
          type: 'text',
        },
      ],
      role: 'user',
    };

    const messages = await this.getMessages(
      contextStrategy,
      conversations,
      model,
      question,
    );

    const {
      content,
      stop_reason: reason,
      stop_sequence: sequence,
      usage: { input_tokens: input, output_tokens: output },
    } = await this.claude.fetchApi({
      messages,
      model,
      stopSequences,
      temperature,
    });

    // TODO do not add if reason === 'max_tokens'

    await this.history.add(
      {
        ...message,
        usage: input,
      },
      {
        content,
        role: 'assistant',
        usage: output,
      },
    );

    let answer = '';

    for (const item of content) {
      if (answer.length > 0) {
        answer += '\n\n';
      }
      if (item.type === 'text') {
        answer += item.text;
      } else {
        answer += `[${item.type}]`;
      }
    }

    return {
      answer,
      reason,
      sequence,
      total: this.history.total,
      usage: { input, output },
    };
  }

  private createUserMessage(prompts: string[]): Message {
    const nonEmptyPrompts = prompts
      .map((value) => value.trim())
      .filter((value) => !!value);
    if (nonEmptyPrompts.length < 1) {
      throw new Error('Internal: cannot create empty user message');
    }
    return {
      content: nonEmptyPrompts.map((text) => ({
        text,
        type: 'text',
      })),
      role: 'user',
    };
  }

  private async getMessages(
    contextStrategy: ContextStrategy,
    conversations: number,
    // TODO контролируя проверку ошибок и max tokens, я бы мог сам выбирать модель
    model: string,
    question: string,
  ): Promise<DeepReadonly<Message>[]> {
    if (contextStrategy === ContextStrategy.Summarize) {
      return this.getMessagesFromSummary(conversations, model, question);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const history = this.history.get().map(({ usage, ...message }) => message);
    history.push(this.createUserMessage([question]));
    return history;
  }

  private async getMessagesFromSummary(
    limit: number,
    model: string,
    question: string,
  ): Promise<DeepReadonly<Message>[]> {
    const history = this.history.getAll().reduce((agg, cur) => {
      if (isSummaryRO(cur)) {
        return [];
      } else {
        agg.push(cur);
        return agg;
      }
    }, [] as DeepReadonly<Message>[]);

    if (history.length < limit * 2) {
      history.push(this.createUserMessage([question]));
      return history;
    }

    const {
      content,
      // stop_reason,
      usage: { input_tokens: input, output_tokens: output },
    } = await this.claude.fetchApi({
      messages: [...history, this.createUserMessage([COMPRESSION_USER_CODE])],
      model,
      stopSequences: [],
      system: COMPRESSION_SYSTEM_CODE,
    });

    // TODO stop_reason == 'max_tokens'

    await this.history.summarize(input, output, content);

    return [
      this.createUserMessage([
        ...content
          .filter((item): item is ClaudeTextContent => item.type === 'text')
          .map(({ text }) => text),
        question,
      ]),
    ];
  }
}
