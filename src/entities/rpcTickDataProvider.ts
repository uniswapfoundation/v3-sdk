import { BigintIsh } from '@uniswap/sdk-core'
import { TickList } from '../utils/tickList.js'
import { Tick } from './tick.js'
import { TickDataProvider } from './tickDataProvider.js'
import { ethers } from 'ethers'
import { TickMath } from '../utils/index.js'
import { RPCPool } from '../utils/rpcPool.js'

/**
 * A data provider for ticks that is backed by an in-memory array of ticks.
 */
export class RPCTickDataProvider implements TickDataProvider {
  private ticks: readonly Tick[] = []
  private provider: ethers.providers.Provider
  private poolAddress: string
  private ticksInitialized: boolean = false

  /**
   * Constructs an on-chain tick data fetcher. To be used in conjunction with classes that need to fetch ticks like Pool.
   *
   * @param provider The provider to use for fetching ticks.
   * @param poolAddress The pool address to fetch ticks from.
   */
  constructor(provider: ethers.providers.Provider, poolAddress: string) {
    this.provider = provider
    this.poolAddress = poolAddress
  }

  async rpcFetchTicks(): Promise<void> {
    await this.fetchTicks()
  }

  async getTick(tick: number): Promise<{ liquidityNet: BigintIsh; liquidityGross: BigintIsh }> {
    if (!this.ticksInitialized) {
      this.fetchTicks()
      this.ticksInitialized = true
    }
    return TickList.getTick(this.ticks, tick)
  }

  async nextInitializedTickWithinOneWord(tick: number, lte: boolean, tickSpacing: number): Promise<[number, boolean]> {
    if (!this.ticksInitialized) {
      this.fetchTicks()
      this.ticksInitialized = true
    }
    return TickList.nextInitializedTickWithinOneWord(this.ticks, tick, lte, tickSpacing)
  }

  private async fetchTicks() {
    // Get current blocknumber and Pooldata
    const blockNum = await this.provider.getBlockNumber()
    const poolData = await RPCPool.getPoolData(this.provider, this.poolAddress, blockNum)

    // Get Word Range
    const tickLower = -887272
    const tickUpper = 887272
    const lowerWord = TickMath.tickToWordCompressed(tickLower, poolData.tickSpacing)
    const upperWord = TickMath.tickToWordCompressed(tickUpper, poolData.tickSpacing)

    // Fetch all initialized tickIndices in word range
    const tickIndices = await RPCPool.getTickIndicesInWordRange(
      this.provider,
      poolData.address,
      poolData.tickSpacing,
      lowerWord,
      upperWord
    )

    // Fetch all initialized ticks from tickIndices
    this.ticks = await RPCPool.getAllTicks(this.provider, poolData.address, tickIndices)
  }
}
