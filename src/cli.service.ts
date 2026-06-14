import { Injectable } from '@nestjs/common';
import readline from 'readline';

import {
  AgentService,
  AgentServiceRequestParams,
  AgentServiceResponse,
  ContextStrategy,
} from './agent';
import { DraftService } from './draft.service';

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

  constructor(
    private readonly agent: AgentService,
    private readonly drafts: DraftService,
  ) {
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
    const context: AgentServiceRequestParams = {
      contextStrategy: ContextStrategy.Full,
      stopSequences: [],
    };

    while (true) {
      const userInput = await this.ask(`${COLORS.green}< ${COLORS.reset}`).then(
        (input: string) => input.trim(),
      );

      if (userInput.startsWith('./')) {
        await this.processDraft(userInput, lines);
        continue;
      }

      if (userInput.startsWith('/exit')) {
        break;
      }

      if (
        userInput.startsWith('/') &&
        this.processCommand(userInput, context)
      ) {
        continue;
      }

      if (userInput !== '') {
        lines.push(userInput);
        continue;
      }
      if (lines.length === 0) {
        continue;
      }

      const question = lines.join('\n');

      const {
        contextStrategy,
        conversations,
        model,
        stopSequences,
        temperature,
      } = context;
      answer = await this.agent.ask({
        contextStrategy,
        conversations,
        model: model ?? MODELS.haiku,
        question,
        stopSequences,
        temperature,
      });
      this.printAnswer(answer);

      lines = [];
      context.model = undefined;
      context.stopSequences = [];
      context.temperature = undefined;
    }

    this.printG(`< input total  ${answer?.total.input ?? 0}\n`);
    this.printY(`> output total ${answer?.total.output ?? 0}\n`);

    this.rl.close();
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

  private processCommand(
    userInput: string,
    context: AgentServiceRequestParams,
  ): boolean {
    if (userInput.startsWith('/?')) {
      this.printC('Commands:\n');
      this.write(` /cstr <${Object.values(ContextStrategy).join('|')}>\n`);
      this.write(' /exit\n');
      this.write(` /model <${Object.keys(MODELS).join('|')}>\n`);
      this.write(` /stop sequence1[,sequence2[,..]]\n`);
      this.write(` /temp 0..1\n`);
      this.print('\n');
      return true;
    }

    if (userInput.startsWith(`/cstr`)) {
      const [enumKey, param] = userInput.slice(6).trim().split(' ', 2);

      if (!enumKey) {
        const cs = context.contextStrategy;
        this.printC(`ContextStrategy is ${cs}`);

        if (cs !== ContextStrategy.Full) {
          this.write(` ${context.conversations}`);
        }

        this.write('\n  /cstr full - полная история\n');
        this.write('  /cstr slid <int> - размер окна\n');
        this.write('  /cstr summ <int> - суммаризация после N реплик');

        this.print('\n');
        return true;
      }

      if (
        !Object.values(ContextStrategy).includes(enumKey as ContextStrategy)
      ) {
        this.printR(`Unknown context strategy ${enumKey}`);
        this.print('\n');
        return true;
      }

      context.contextStrategy = enumKey as ContextStrategy;
      delete context.conversations;

      if (context.contextStrategy !== ContextStrategy.Full) {
        const conversations = Number.parseInt(param);
        if (!Number.isNaN(conversations) && conversations > 0) {
          context.conversations = conversations;
        } else {
          context.conversations = 20;
        }
        this.printC(
          `${context.contextStrategy} after ${conversations} message`,
        );
        this.print('\n');
      }

      return true;
    }
    if (userInput.startsWith('/model')) {
      const modelKey = userInput.slice(7).trim();
      const modelValue = MODELS[modelKey];
      if (modelValue) {
        context.model = modelValue;
        this.printC(`Model set to ${modelValue}`);
      } else {
        this.printR(
          `Unknown model ${modelKey}, one of ${Object.keys(MODELS).join(', ')}`,
        );
      }
      this.print('\n');
      return true;
    }
    if (userInput.startsWith('/stop')) {
      context.stopSequences.push(userInput.slice(6).trim());
      return true;
    }
    if (userInput.startsWith('/temp')) {
      context.temperature = Number.parseFloat(userInput.slice(6));
      return true;
    }
    return false;
  }

  private async processDraft(userInput: string, lines: string[]) {
    if (userInput === './') {
      const drafts = await this.drafts.list();
      if (drafts.length > 0) {
        this.printC(
          drafts
            .map((draft) => ` - ${draft.slice(0, draft.lastIndexOf('.'))}`)
            .join('\n'),
        );
      } else {
        this.printR(`No drafts at ${this.drafts.path}`);
      }
      this.print('\n');
    } else {
      try {
        const fileContent = await this.drafts.get(userInput.slice(2).trim());
        this.printC('\n');

        for (const line of fileContent.split('\n')) {
          this.write(`${line}\n`);
          lines.push(line);
        }
      } catch (error) {
        this.printR(error instanceof Error ? error.message : String(error));
      }

      this.print('\n');
    }
  }

  private write(s: string) {
    this.rl.pause();
    process.stdout.write(s);
    this.rl.resume();
  }

  private formatNumber = (n: number) => String(n).padStart(7);
  private print = (s: string = '') => this.write(`${COLORS.reset}${s}`);
  private printC = (s: string = '') => this.write(`${COLORS.cyan}${s}`);
  private printG = (s: string = '') => this.write(`${COLORS.green}${s}`);
  private printR = (s: string = '') => this.write(`${COLORS.red}${s}`);
  private printY = (s: string = '') => this.write(`${COLORS.yellow}${s}`);
}
