/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { GENESIS_BLOCK_SEQUENCE, Assert } from 'ironfish'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import cli from 'cli-ux'
import fs from 'fs'

interface ProgressBar {
  progress: VoidFunction
  start: (current?: number, total?: number) => void
  stop: VoidFunction
  update: (number: number) => void
  getTotal: () => number
  increment: VoidFunction
}

function parseNumber(input: string): number | null {
  const parsed = Number(input)
  return isNaN(parsed) ? null : parsed
}

export default class Export extends IronfishCommand {
  static description = 'Export part of the chain database to JSON'

  static flags = {
    ...LocalFlags,
    path: flags.string({
      char: 'p',
      parse: (input: string): string => input.trim(),
      required: false,
      default: '../ironfish-graph-explorer/src/data.json',
      description: 'a path to export the chain to',
    }),
  }

  static args = [
    {
      name: 'start',
      parse: parseNumber,
      default: Number(GENESIS_BLOCK_SEQUENCE),
      required: false,
      description: 'the sequence to start at (inclusive, genesis block is 1)',
    },
    {
      name: 'stop',
      parse: parseNumber,
      required: false,
      description: 'the sequence to end at (inclusive)',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = this.parse(Export)

    cli.action.start('Opening node')
    const node = await this.sdk.node()
    await node.openDB()
    await node.chain.open()
    await node.seed()
    cli.action.stop('done.')

    Assert.isNotNull(node.chain.head, 'head')
    Assert.isNotNull(node.chain.latest, 'latest')

    const min = Number(GENESIS_BLOCK_SEQUENCE)
    const max = Number(node.chain.latest.sequence)

    const path = node.files.resolve(flags.path)
    const start = Math.min(Math.max(args.start ? (args.start as number) : min, min), max)
    const stop = Math.min(Math.max(args.stop ? (args.stop as number) : max, start), max)

    this.log(`Exporting chain from ${start} -> ${stop} to ${path}`)

    const result = []

    const progress = cli.progress({
      format: 'Exporting blocks: [{bar}] {value}/{total} {percentage}% | ETA: {eta}s',
    }) as ProgressBar

    progress.start(stop - start, 0)

    for (let i = start; i <= stop; ++i) {
      const blocks = await node.chain.getHeadersAtSequence(BigInt(i))

      for (const block of blocks) {
        const isMain = await node.chain.isHeadChain(block)

        result.push({
          hash: block.hash.toString('hex'),
          seq: Number(block.sequence),
          prev: block.previousBlockHash.toString('hex'),
          main: isMain,
          graffiti: block.graffiti.toString('ascii'),
          work: block.work.toString(),
          head: block.hash.equals(node.chain.head.hash),
          latest: block.hash.equals(node.chain.latest.hash),
        })
      }

      progress.increment()
    }

    progress.stop()

    await fs.promises.writeFile(path, JSON.stringify(result, undefined, '  '))
    this.log('Export complete')
  }
}