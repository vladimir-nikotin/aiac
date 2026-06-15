import { Injectable } from '@nestjs/common';

import {
  ClaudeService,
  ClaudeStopReason,
  ClaudeTextContent,
  Message,
  Role,
} from '../claude';
import { DeepReadonly } from '../types';
import {
  HistoryService,
  isSummaryRO,
  sMessageToMessage,
  SummaryPoint,
} from './history.service';
import { COMPRESSION_SYSTEM_CODE, COMPRESSION_USER_CODE } from './prompts';
import { FactsService } from './fatcs.service';

export enum ContextStrategy {
  Facts = 'fact',
  Full = 'full',
  SlidingWindow = 'slid',
  Summarize = 'summ',
}
export type AgentServiceRequestParams = {
  contextStrategy: ContextStrategy;
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
    private readonly facts: FactsService,
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

    if (contextStrategy === ContextStrategy.Facts) {
      const exist = await this.facts.exist();
      if (exist) {
        await this.facts.update(model, message, {
          content,
          role: 'assistant',
        });
      } else {
        await this.facts.create(model, messages, {
          content,
          role: 'assistant',
        });
      }
    }

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

  private createMessage(prompts: string[], role: Role = 'user'): Message {
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
      role,
    };
  }

  private async getMessages(
    contextStrategy: ContextStrategy,
    conversations: number,
    // TODO контролируя проверку ошибок и max tokens, я бы мог сам выбирать модель
    model: string,
    question: string,
  ): Promise<DeepReadonly<Message>[]> {
    switch (contextStrategy) {
      case ContextStrategy.Summarize:
        return this.getMessagesFromSummary(conversations, model, question);
      case ContextStrategy.SlidingWindow:
        return this.getMessagesInWindow(conversations, question);
      case ContextStrategy.Facts:
        return this.getMessagesForFacts(conversations, question);
      case ContextStrategy.Full:
        return this.getMessagesFull(question);
    }
  }

  private async getMessagesForFacts(limit: number, question: string) {
    const exists = await this.facts.exist();
    if (exists) {
      return this.getMessagesInWindow(limit, question);
    } else {
      return this.getMessagesFull(question);
    }
  }

  // TODO слишком много ответственности. этому место в summary service?
  private async getMessagesFromSummary(
    limit: number,
    model: string,
    question: string,
  ): Promise<DeepReadonly<Message>[]> {
    let lastSummary: DeepReadonly<SummaryPoint> | undefined;
    const history = this.history.getAll().reduce((agg, cur) => {
      if (isSummaryRO(cur)) {
        lastSummary = cur;
        return [];
      } else {
        agg.push(sMessageToMessage(cur));
        return agg;
      }
    }, [] as DeepReadonly<Message>[]);

    if (history.length < limit * 2) {
      // добавялем начало разговора из саммари
      // TODO можон лучше, хранить сразу парой. type: summary транслируется в role: user.
      // а дальше history начиная с assistant
      if (lastSummary) {
        history.unshift(
          this.createMessage(['Контекст разговора из истории переписки']),
          this.createMessage(
            lastSummary.content
              .filter((item): item is ClaudeTextContent => item.type === 'text')
              .map(({ text }) => text),
            'assistant',
          ),
        );
      }
      history.push(this.createMessage([question]));
      return history;
    }

    const {
      content,
      // stop_reason,
      usage: { input_tokens: input, output_tokens: output },
    } = await this.claude.fetchApi({
      messages: [...history, this.createMessage([COMPRESSION_USER_CODE])],
      model,
      system: COMPRESSION_SYSTEM_CODE,
    });

    // TODO stop_reason == 'max_tokens'

    await this.history.summarize(input, output, content);

    return [
      this.createMessage([
        ...content
          .filter((item): item is ClaudeTextContent => item.type === 'text')
          .map(({ text }) => text),
        question,
      ]),
    ];
  }
  private getMessagesFull(question: string) {
    return [
      ...this.history.getMessages().map(sMessageToMessage),
      this.createMessage([question]),
    ];
  }
  private getMessagesInWindow(limit: number, question: string) {
    return [
      ...this.history
        .getMessages()
        .slice(-2 * limit)
        .map(sMessageToMessage),
      this.createMessage([question]),
    ];
  }
}
