import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepReadonly } from '../types';
import { ProxyAgent, fetch } from 'undici';

// type ContentType = 'document' | 'image' | 'text' | 'tool_use' | 'tool_result';
type ClaudeTextContent = {
  type: 'text';
  text: string;
};
type ClaudeResponseToolContent = {
  type: 'tool_use';
  text: never;
  id: string;
  name: string;
  input: Record<string, any>;
};
type ClaudeContent = ClaudeTextContent | ClaudeResponseToolContent;

type Role = 'assistant' | 'user';

export type Message = {
  content: ClaudeContent[];
  role: Role;
};

type ClaudeServiceRequest = {
  messages: Message[];
  model?: string;
  stopSequences: string[];
  system?: string;
  temperature?: number;
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
const DEFAULT_TEMPERATURE = 1;

@Injectable()
export class ClaudeService {
  constructor(private readonly config: ConfigService) {}

  async fetchApi({
    messages,
    model,
    stopSequences,
    temperature,
  }: DeepReadonly<ClaudeServiceRequest>): Promise<ClaudeResponse> {
    const headers = {
      'anthropic-version': this.config.getOrThrow<string>('claude.api.version'),
      'content-type': 'application/json',
      'x-api-key': this.config.getOrThrow<string>('claude.api.key'),
    };
    const dispatcher = new ProxyAgent({
      uri: this.config.getOrThrow<string>('claude.proxy.url'),
    });

    const response = await fetch(
      this.config.getOrThrow<string>('claude.api.url'),
      {
        body: JSON.stringify({
          max_tokens: this.config.getOrThrow<number>('claude.maxTokens'),
          messages,
          model: model ?? DEFAULT_MODEL,
          stop_sequences: stopSequences,
          temperature: temperature ?? DEFAULT_TEMPERATURE,
        }),
        dispatcher,
        headers,
        method: 'POST',
      },
    );

    const { ok, status, statusText } = response;

    if (!ok) {
      // TODO wrap 429 Too Many Requests means api input overflow (> 4 MB)
      // TODO wrap 400 Bad Request means any internal problem: overflow, max tokens-model mismatch etc
      throw new Error(`Error ${status} ${statusText}`);
    }
    if (status !== 200) {
      throw new Error(`Something went wrong ${status} ${statusText}`);
    }

    return response.json() as Promise<ClaudeResponse>;
  }
}
