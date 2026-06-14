import { Injectable } from '@nestjs/common';
import readline from 'readline';

import { AgentService, AgentServiceResponse } from './agent';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

const MODELS: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  opus6: 'claude-opus-4-6',
  opus7: 'claude-opus-4-7',
  opus8: 'claude-opus-4-8',
};

@Injectable()
export class CliService {
  private readonly ask: (prompt: string) => Promise<string>;
  private readonly rl: readline.Interface;

  constructor(private readonly agent: AgentService) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.ask = (prompt: string) =>
      new Promise<string>((resolve) => rl.question(prompt, resolve));
    this.rl = rl;
  }

  async run() {
    let answer: AgentServiceResponse | undefined = undefined;
    let lines: string[] = [];
    let model: string | undefined;
    let stopSequences: string[] = [];
    let temperature: number | undefined;

    while (true) {
      const userInput = await this.ask('< ').then((input: string) =>
        input.trim(),
      );

      if (userInput.startsWith('/model')) {
        const modelValue = MODELS[userInput.slice(7).trim()];
        if (modelValue) {
          model = modelValue;
        }
      }
      if (userInput.startsWith('/exit')) {
        break;
      }
      if (userInput.startsWith('/stop')) {
        stopSequences.push(userInput.slice(6).trim());
      }
      if (userInput.startsWith('/temp')) {
        temperature = Number.parseFloat(userInput.slice(6));
      }

      if (userInput !== '') {
        lines.push(userInput);
        continue;
      }
      if (lines.length === 0) {
        continue;
      }

      const question = lines.join('\n');

      answer = await this.agent.ask({
        model: model ?? MODELS.haiku,
        question,
        stopSequences,
        temperature,
      });
      this.printAnswer(answer);

      lines = [];
      model = undefined;
      stopSequences = [];
      temperature = undefined;
    }

    this.printG(`< input total  ${answer?.total.input ?? 0}\n`);
    this.printY(`> output total ${answer?.total.output ?? 0}\n`);

    this.rl.close();
    // process.exit();
  }

  private printAnswer(agentResponse: AgentServiceResponse) {
    this.printUsage(agentResponse);

    const { answer } = agentResponse;
    this.write(answer);
    this.write('\n\n');

    this.printUsage(agentResponse);
  }

  private printUsage({ reason, sequence, total, usage }: AgentServiceResponse) {
    // input token line
    this.printG('< input \t');
    this.print(this.formatNumber(usage.input));
    this.printG(`\t\ttotal ${this.formatNumber(total.input)}\n`);

    // output token line
    this.printY('> output\t');
    this.print(this.formatNumber(usage.output));
    this.printY(`\t\ttotal ${this.formatNumber(total.output)}`);
    this.print();

    // stop reason (in output line)
    if (reason === 'max_tokens') {
      this.printR(' TOKEN LIMIT');
      this.print();
    }
    if (sequence !== null) {
      this.printR(' STOP ');
      this.print(sequence);
    }

    this.write('\n');
  }

  private write(s: string) {
    this.rl.pause();
    process.stdout.write(s);
    this.rl.resume();
  }

  private formatNumber = (n: number) => String(n).padStart(7);
  private print = (s: string = '') => this.write(`${COLORS.reset}${s}`);
  private printG = (s: string = '') => this.write(`${COLORS.green}${s}`);
  private printR = (s: string = '') => this.write(`${COLORS.red}${s}`);
  private printY = (s: string = '') => this.write(`${COLORS.yellow}${s}`);
}
