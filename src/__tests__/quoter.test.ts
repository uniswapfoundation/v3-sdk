import JSBI from 'jsbi'
import { CurrencyAmount, Fraction, Token, TradeType, WETH9 } from '@uniswap/sdk-core'
import { FeeAmount, TICK_SPACINGS } from 'src/constants'
import { SwapQuoter } from 'src/quoter'
import { nearestUsableTick, encodeSqrtRatioX96, TickMath } from 'src/utils'
import { Route, Trade, Pool } from 'src/entities'
import { ethers } from 'ethers'
import getBlock from './stubs/calls/getBlock.json'
import callResults from './stubs/calls/callResults.json'

let expectedMockedTransactionHash = ''
class QuoterMockProvider extends ethers.providers.BaseProvider {
  async perform(method: string, params: any): Promise<any> {
    if (method === 'getGasPrice') {
      return '0xBA43B7400'
    }
    if (method === 'getBlock') {
      return getBlock
    }
    if (method === 'getTransactionCount') {
      return 0
    }
    if (method === 'estimateGas') {
      return 1000000
    }
    if (method === 'getBlockNumber') {
      return getBlock.number
    }
    if (method === 'sendTransaction') {
      return expectedMockedTransactionHash
    }
    if (method === 'call') {
      for (const result of callResults) {
        if (result.transaction.to === params.transaction.to && result.transaction.data === params.transaction.data) {
          return result.result
        }
      }
    }

    return super.perform(method, params)
  }

  async detectNetwork(): Promise<ethers.providers.Network> {
    return { chainId: 1, name: 'mainnet' }
  }
}

describe('SwapQuoter', () => {
  const token0 = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'token0')
  const token1 = new Token(1, '0x0000000000000000000000000000000000000002', 18, 't1', 'token1')

  const feeAmount = FeeAmount.MEDIUM
  const sqrtRatioX96 = encodeSqrtRatioX96(1, 1)
  const liquidity = 1_000_000
  const WETH = WETH9[1]

  const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
  const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')

  const makePool = (token0: Token, token1: Token) => {
    return new Pool(token0, token1, feeAmount, sqrtRatioX96, liquidity, TickMath.getTickAtSqrtRatio(sqrtRatioX96), [
      {
        index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: liquidity,
        liquidityGross: liquidity,
      },
      {
        index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: -liquidity,
        liquidityGross: liquidity,
      },
    ])
  }

  const pool_0_1 = makePool(token0, token1)
  const pool_1_weth = makePool(token1, WETH)

  describe('#swapCallParameters', () => {
    describe('single trade input', () => {
      it('single-hop exact input', async () => {
        const trade = await Trade.fromRoute(
          new Route([pool_0_1], token0, token1),
          CurrencyAmount.fromRawAmount(token0, 100),
          TradeType.EXACT_INPUT
        )
        const { calldata, value } = SwapQuoter.quoteCallParameters(
          trade.swaps[0].route,
          trade.inputAmount,
          trade.tradeType
        )

        expect(calldata).toBe(
          '0xf7729d43000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb800000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000000'
        )
        expect(value).toBe('0x00')
      })

      it('single-hop exact output', async () => {
        const trade = await Trade.fromRoute(
          new Route([pool_0_1], token0, token1),
          CurrencyAmount.fromRawAmount(token1, 100),
          TradeType.EXACT_OUTPUT
        )
        const { calldata, value } = SwapQuoter.quoteCallParameters(
          trade.swaps[0].route,
          trade.outputAmount,
          trade.tradeType
        )

        expect(calldata).toBe(
          '0x30d07f21000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb800000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000000'
        )
        expect(value).toBe('0x00')
      })

      it('multi-hop exact input', async () => {
        const trade = await Trade.fromRoute(
          new Route([pool_0_1, pool_1_weth], token0, WETH),
          CurrencyAmount.fromRawAmount(token0, 100),
          TradeType.EXACT_INPUT
        )
        const { calldata, value } = SwapQuoter.quoteCallParameters(trade.route, trade.inputAmount, trade.tradeType)

        expect(calldata).toBe(
          '0xcdca17530000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000420000000000000000000000000000000000000001000bb80000000000000000000000000000000000000002000bb8c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000000'
        )
        expect(value).toBe('0x00')
      })

      it('multi-hop exact output', async () => {
        const trade = await Trade.fromRoute(
          new Route([pool_0_1, pool_1_weth], token0, WETH),
          CurrencyAmount.fromRawAmount(WETH, 100),
          TradeType.EXACT_OUTPUT
        )
        const { calldata, value } = SwapQuoter.quoteCallParameters(trade.route, trade.outputAmount, trade.tradeType)

        expect(calldata).toBe(
          '0x2f80bb1d000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000042c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000bb80000000000000000000000000000000000000002000bb80000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000'
        )
        expect(value).toBe('0x00')
      })
      it('sqrtPriceLimitX96', async () => {
        const trade = await Trade.fromRoute(
          new Route([pool_0_1], token0, token1),
          CurrencyAmount.fromRawAmount(token0, 100),
          TradeType.EXACT_INPUT
        )
        const { calldata, value } = SwapQuoter.quoteCallParameters(trade.route, trade.inputAmount, trade.tradeType, {
          sqrtPriceLimitX96: JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128)),
        })

        expect(calldata).toBe(
          '0xf7729d43000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000bb800000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000100000000000000000000000000000000'
        )
        expect(value).toBe('0x00')
      })
    })
    describe('single trade input using Quoter V2', () => {
      it('single-hop exact output', async () => {
        const trade = await Trade.fromRoute(
          new Route([pool_0_1], token0, token1),
          CurrencyAmount.fromRawAmount(token1, 100),
          TradeType.EXACT_OUTPUT
        )

        const { calldata, value } = SwapQuoter.quoteCallParameters(
          trade.swaps[0].route,
          trade.outputAmount,
          trade.tradeType,
          {
            useQuoterV2: true,
          }
        )

        expect(calldata).toBe(
          '0xbd21704a0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000bb80000000000000000000000000000000000000000000000000000000000000000'
        )
        expect(value).toBe('0x00')
      })
      it('single-hop exact input', async () => {
        const trade = await Trade.fromRoute(
          new Route([pool_0_1], token0, token1),
          CurrencyAmount.fromRawAmount(token0, 100),
          TradeType.EXACT_INPUT
        )
        const { calldata, value } = SwapQuoter.quoteCallParameters(
          trade.swaps[0].route,
          trade.inputAmount,
          trade.tradeType,
          { useQuoterV2: true }
        )

        expect(calldata).toBe(
          '0xc6a5026a0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000bb80000000000000000000000000000000000000000000000000000000000000000'
        )
        expect(value).toBe('0x00')
      })
    })
  })

  // RPC Testing

  describe('#rpc', () => {
    // Mock provider used in all provider function calls
    const mockProvider = new QuoterMockProvider(1)

    describe('#quoteExactInputSingle', () => {
      it('correctly quotes exact input single', async () => {
        const quote = await SwapQuoter.quoteExactInputSingle({
          amountIn: CurrencyAmount.fromFractionalAmount(USDC, 1000, 1),
          poolFee: FeeAmount.LOW,
          provider: mockProvider,
          tokenOut: DAI,
        })

        expect(quote.currency.address).toEqual(DAI.address)
        expect(quote.equalTo(new Fraction(998596228517113n, 1n))).toEqual(true)
      })
    })

    describe('#quoteExactOutputSingle', () => {
      it('correctly quotes exact output single', async () => {
        const quote = await SwapQuoter.quoteExactOutputSingle({
          amountOut: CurrencyAmount.fromFractionalAmount(USDC, 1000, 1),
          poolFee: FeeAmount.LOW,
          provider: mockProvider,
          tokenIn: DAI,
        })

        expect(quote.currency.address).toEqual(DAI.address)
        expect(quote.equalTo(new Fraction(1000095873009476n, 1n))).toEqual(true)
      })
    })

    describe('#callQuoter', () => {
      it('correctly calls callQuoter', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })

        const quote = await SwapQuoter.callQuoter({
          route: new Route([pool], USDC, DAI),
          amount: CurrencyAmount.fromFractionalAmount(USDC, 1000, 1),
          tradeType: TradeType.EXACT_INPUT,
          provider: mockProvider,
        })

        expect(quote.currency.address).toEqual(DAI.address)
        expect(quote.equalTo(new Fraction(998596228517113n, 1n))).toEqual(true)
      })
    })
  })
})
