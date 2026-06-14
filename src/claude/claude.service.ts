import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepReadonly } from '../types';
import { ProxyAgent, fetch } from 'undici';

// type ContentType = 'document' | 'image' | 'text' | 'tool_use' | 'tool_result';
export type ClaudeTextContent = {
  type: 'text';
  text: string;
};
type ClaudeResponseToolContent = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
};
export type ClaudeContent = ClaudeTextContent | ClaudeResponseToolContent;

export type Role = 'assistant' | 'user';

export type Message = {
  content: ClaudeContent[];
  role: Role;
};

type ClaudeServiceRequest = {
  messages: Message[] | DeepReadonly<Message>[];
  model?: string;
  stopSequences: string[];
  system?: string;
  temperature?: number;
};

type ClaudeBody = {
  // betas: unknown[]
  model: string;
  max_tokens: number;
  messages: Message[] | DeepReadonly<Message>[];
  // metadata: object;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string | string[];
  temperature?: number;
  // thinking: object;
  // tool_choice
  // tools
  top_k?: number;
  top_p?: number;
};

export type ClaudeStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use';
type ClaudeTokenUsage = {
  input_tokens: number;
  output_tokens: number;
};

type ClaudeResponse = {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ClaudeContent[];
  stop_reason: ClaudeStopReason;
  stop_sequence: string | null;
  usage: ClaudeTokenUsage;
};

const DEFAULT_MODEL = 'claude-sonnet-4-6';
// const DEFAULT_TEMPERATURE = 1;

@Injectable()
export class ClaudeService {
  constructor(private readonly config: ConfigService) {}

  async fetchApi({
    messages,
    model,
    stopSequences,
    system,
    temperature,
  }: ClaudeServiceRequest): Promise<ClaudeResponse> {
    const headers = {
      'anthropic-version': this.config.getOrThrow<string>('claude.api.version'),
      'content-type': 'application/json',
      'x-api-key': this.config.getOrThrow<string>('claude.api.key'),
    };
    const dispatcher = new ProxyAgent({
      uri: this.config.getOrThrow<string>('claude.proxy.url'),
    });

    const body: ClaudeBody = {
      max_tokens: this.config.getOrThrow<number>('claude.maxTokens'),
      messages: messages,
      model: model ?? DEFAULT_MODEL,
      // temperature: temperature ?? DEFAULT_TEMPERATURE,
    };

    if (stopSequences && stopSequences.length > 0) {
      body.stop_sequences = stopSequences;
    }
    if (system) {
      body.system = system;
    }
    if (temperature) {
      body.temperature = temperature;
    }

    const response = await fetch(
      this.config.getOrThrow<string>('claude.api.url'),
      {
        body: JSON.stringify(body),
        dispatcher,
        headers,
        method: 'POST',
      },
    );

    const { ok, status, statusText } = response;

    if (!ok) {
      // TODO wrap 429 Too Many Requests means api input overflow (> 4 MB)
      // TODO wrap 400 Bad Request means any internal problem: overflow, max tokens-model mismatch etc
      throw new Error(
        `Error ${status} ${statusText}\n\n${JSON.stringify(body)}`,
      );
    }
    if (status !== 200) {
      throw new Error(`Something went wrong ${status} ${statusText}`);
    }

    return response.json() as Promise<ClaudeResponse>;
  }
}
