import { Token, WETH9, CurrencyAmount } from '@uniswap/sdk-core'
import { FeeAmount, TICK_SPACINGS } from 'src/constants'
import { nearestUsableTick } from 'src/utils/nearestUsableTick'
import { TickMath } from 'src/utils/tickMath'
import { Pool } from 'src/entities/pool'
import { encodeSqrtRatioX96 } from 'src/utils/encodeSqrtRatioX96'
import JSBI from 'jsbi'
import { NEGATIVE_ONE } from 'src/internalConstants'
import { ethers } from 'ethers'
import getBlock from '../stubs/calls/getBlock.json'
import callResults from '../stubs/calls/callResults.json'

const ONE_ETHER = JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(18))

let expectedMockedTransactionHash = ''
class PoolMockProvider extends ethers.providers.BaseProvider {
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

describe('Pool', () => {
  const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
  const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')

  describe('constructor', () => {
    it('cannot be used for tokens on different chains', () => {
      expect(() => {
        new Pool(USDC, WETH9[3], FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0, [])
      }).toThrow('CHAIN_IDS')
    })

    it('fee must be integer', () => {
      expect(() => {
        new Pool(USDC, WETH9[1], FeeAmount.MEDIUM + 0.5, encodeSqrtRatioX96(1, 1), 0, 0, [])
      }).toThrow('FEE')
    })

    // TODO: Typescript compiler doesn't allow arbitrary numbers for FeeAmount
    // it('fee cannot be more than 1e6', () => {
    //   expect(() => {
    //     new Pool(USDC, WETH9[1], 1e6, encodeSqrtRatioX96(1, 1), 0, 0, [])
    //   }).toThrow('FEE')
    // })

    it('cannot be given two of the same token', () => {
      expect(() => {
        new Pool(USDC, USDC, FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0, [])
      }).toThrow('ADDRESSES')
    })

    it('price must be within tick price bounds', () => {
      expect(() => {
        new Pool(USDC, WETH9[1], FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 1, [])
      }).toThrow('PRICE_BOUNDS')
      expect(() => {
        new Pool(USDC, WETH9[1], FeeAmount.MEDIUM, JSBI.add(encodeSqrtRatioX96(1, 1), JSBI.BigInt(1)), 0, -1, [])
      }).toThrow('PRICE_BOUNDS')
    })

    it('works with valid arguments for empty pool medium fee', () => {
      new Pool(USDC, WETH9[1], FeeAmount.MEDIUM, encodeSqrtRatioX96(1, 1), 0, 0, [])
    })

    it('works with valid arguments for empty pool low fee', () => {
      new Pool(USDC, WETH9[1], FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
    })

    it('works with valid arguments for empty pool lowest fee', () => {
      new Pool(USDC, WETH9[1], FeeAmount.LOWEST, encodeSqrtRatioX96(1, 1), 0, 0, [])
    })

    it('works with valid arguments for empty pool high fee', () => {
      new Pool(USDC, WETH9[1], FeeAmount.HIGH, encodeSqrtRatioX96(1, 1), 0, 0, [])
    })
  })

  describe('#getAddress', () => {
    it('matches an example', () => {
      const result = Pool.getAddress(USDC, DAI, FeeAmount.LOW)
      expect(result).toEqual('0x6c6Bc977E13Df9b0de53b251522280BB72383700')
    })
  })

  describe('#token0', () => {
    it('always is the token that sorts before', () => {
      let pool = new Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.token0).toEqual(DAI)
      pool = new Pool(DAI, USDC, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.token0).toEqual(DAI)
    })
  })
  describe('#token1', () => {
    it('always is the token that sorts after', () => {
      let pool = new Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.token1).toEqual(USDC)
      pool = new Pool(DAI, USDC, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.token1).toEqual(USDC)
    })
  })

  describe('#token0Price', () => {
    it('returns price of token0 in terms of token1', () => {
      expect(
        new Pool(
          USDC,
          DAI,
          FeeAmount.LOW,
          encodeSqrtRatioX96(101e6, 100e18),
          0,
          TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101e6, 100e18)),
          []
        ).token0Price.toSignificant(5)
      ).toEqual('1.01')
      expect(
        new Pool(
          DAI,
          USDC,
          FeeAmount.LOW,
          encodeSqrtRatioX96(101e6, 100e18),
          0,
          TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101e6, 100e18)),
          []
        ).token0Price.toSignificant(5)
      ).toEqual('1.01')
    })
  })

  describe('#token1Price', () => {
    it('returns price of token1 in terms of token0', () => {
      expect(
        new Pool(
          USDC,
          DAI,
          FeeAmount.LOW,
          encodeSqrtRatioX96(101e6, 100e18),
          0,
          TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101e6, 100e18)),
          []
        ).token1Price.toSignificant(5)
      ).toEqual('0.9901')
      expect(
        new Pool(
          DAI,
          USDC,
          FeeAmount.LOW,
          encodeSqrtRatioX96(101e6, 100e18),
          0,
          TickMath.getTickAtSqrtRatio(encodeSqrtRatioX96(101e6, 100e18)),
          []
        ).token1Price.toSignificant(5)
      ).toEqual('0.9901')
    })
  })

  describe('#priceOf', () => {
    const pool = new Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
    it('returns price of token in terms of other token', () => {
      expect(pool.priceOf(DAI)).toEqual(pool.token0Price)
      expect(pool.priceOf(USDC)).toEqual(pool.token1Price)
    })

    it('throws if invalid token', () => {
      expect(() => pool.priceOf(WETH9[1])).toThrow('TOKEN')
    })
  })

  describe('#chainId', () => {
    it('returns the token0 chainId', () => {
      let pool = new Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.chainId).toEqual(1)
      pool = new Pool(DAI, USDC, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
      expect(pool.chainId).toEqual(1)
    })
  })

  describe('#involvesToken', () => {
    const pool = new Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, [])
    expect(pool.involvesToken(USDC)).toEqual(true)
    expect(pool.involvesToken(DAI)).toEqual(true)
    expect(pool.involvesToken(WETH9[1])).toEqual(false)
  })

  describe('swaps', () => {
    let pool: Pool

    beforeEach(() => {
      pool = new Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), ONE_ETHER, 0, [
        {
          index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[FeeAmount.LOW]),
          liquidityNet: ONE_ETHER,
          liquidityGross: ONE_ETHER,
        },
        {
          index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[FeeAmount.LOW]),
          liquidityNet: JSBI.multiply(ONE_ETHER, NEGATIVE_ONE),
          liquidityGross: ONE_ETHER,
        },
      ])
    })

    describe('#getOutputAmount', () => {
      it('USDC -> DAI', async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(USDC, 100)
        const [outputAmount] = await pool.getOutputAmount(inputAmount)
        expect(outputAmount.currency.equals(DAI)).toBe(true)
        expect(outputAmount.quotient).toEqual(JSBI.BigInt(98))
      })
      it('DAI -> USDC', async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(DAI, 100)
        const [outputAmount] = await pool.getOutputAmount(inputAmount)
        expect(outputAmount.currency.equals(USDC)).toBe(true)
        expect(outputAmount.quotient).toEqual(JSBI.BigInt(98))
      })
    })

    describe('#getInputAmount', () => {
      it('USDC -> DAI', async () => {
        const outputAmount = CurrencyAmount.fromRawAmount(DAI, 98)
        const [inputAmount] = await pool.getInputAmount(outputAmount)
        expect(inputAmount.currency.equals(USDC)).toBe(true)
        expect(inputAmount.quotient).toEqual(JSBI.BigInt(100))
      })

      it('DAI -> USDC', async () => {
        const outputAmount = CurrencyAmount.fromRawAmount(USDC, 98)
        const [inputAmount] = await pool.getInputAmount(outputAmount)
        expect(inputAmount.currency.equals(DAI)).toBe(true)
        expect(inputAmount.quotient).toEqual(JSBI.BigInt(100))
      })
    })
  })

  describe('#bigNums', () => {
    let pool: Pool
    const bigNum1 = JSBI.add(JSBI.BigInt(Number.MAX_SAFE_INTEGER), JSBI.BigInt(1))
    const bigNum2 = JSBI.add(JSBI.BigInt(Number.MAX_SAFE_INTEGER), JSBI.BigInt(1))
    beforeEach(() => {
      pool = new Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(bigNum1, bigNum2), ONE_ETHER, 0, [
        {
          index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[FeeAmount.LOW]),
          liquidityNet: ONE_ETHER,
          liquidityGross: ONE_ETHER,
        },
        {
          index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[FeeAmount.LOW]),
          liquidityNet: JSBI.multiply(ONE_ETHER, NEGATIVE_ONE),
          liquidityGross: ONE_ETHER,
        },
      ])
    })

    describe('#priceLimit', () => {
      it('correctly compares two BigIntegers', async () => {
        expect(bigNum1).toEqual(bigNum2)
      })
      it('correctly handles two BigIntegers', async () => {
        const inputAmount = CurrencyAmount.fromRawAmount(USDC, 100)
        const [outputAmount] = await pool.getOutputAmount(inputAmount)
        pool.getInputAmount(outputAmount)
        expect(outputAmount.currency.equals(DAI)).toBe(true)
        // if output is correct, function has succeeded
      })
    })
  })

  // RPC Testing

  describe('#rpc', () => {
    // Mock provider used in all provider function calls
    const signer = new ethers.Wallet('0xd2e184729775354772525ce7a76299efc4a6e157075940d0caa79729f75ed8b4')
    const mockProvider = new PoolMockProvider(1)

    describe('#createPool', () => {
      it('correctly creates a pool', async () => {
        expectedMockedTransactionHash = '0x04a93597e136b82c69fa2c15319ed0d3cf2c50d65fbc80b3f5f96bc35df99ccf'
        const result = await Pool.rpcCreatePool({
          _signer: signer,
          provider: mockProvider,
          fee: FeeAmount.LOW,
          tokenA: USDC.address,
          tokenB: DAI.address,
        })

        expect(result.v).toEqual(0)
        expect(result.r).toEqual('0x05e5d6553abcfaef66a26333adf2ad7ee238b729ffa9d6faa7a3dac88ed1b26f')
        expect(result.s).toEqual('0x7b7a81ea8c356fadf83a30a1d0ae818c583482f12fe9c84f207c7da3bde94c2f')
      })
    })

    describe('#initFromChain', () => {
      it('correctly initializes from chain', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })

        expect(pool._sqrtRatioX96).toEqual(79244178408841362857328n)
        expect(pool._liquidity).toEqual(53978708130719875413601n)
        expect(pool.tickCurrent).toEqual(-276320)
      })
    })

    describe('#rpcSlot0', () => {
      it('correctly fetches slot0', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })

        const slot0 = await pool.rpcSlot0()

        expect(slot0.sqrtPriceX96).toEqual(79244178408841362857328n)
        expect(slot0.tick).toEqual(-276320)
        expect(slot0.observationIndex).toEqual(170)
        expect(slot0.observationCardinality).toEqual(300)
        expect(slot0.observationCardinalityNext).toEqual(300)
        expect(slot0.feeProtocol).toEqual(0)
        expect(slot0.unlocked).toEqual(true)
      })
    })

    describe('#rpcSnapshotCumulativesInside', () => {
      it('correctly fetches snapshotCumulativesInside', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })

        const snapshotCumulativesInside = await pool.rpcSnapshotCumulativesInside({
          tickLower: TickMath.MIN_TICK + 2,
          tickUpper: TickMath.MAX_TICK - 2,
        })

        expect(snapshotCumulativesInside.secondsInside).toEqual(74187737n)
        expect(snapshotCumulativesInside.secondsPerLiquidityInsideX128).toEqual(17888014918977162977313092n)
        expect(snapshotCumulativesInside.tickCumulativeInside).toEqual(-20499761654293n)
      })
    })

    describe('#rpcObserve', () => {
      it('correctly fetches observe', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })

        const observe = await pool.rpcObserve({
          secondsAgo: [0, 10, 100],
        })

        expect(observe.secondsPerLiquidityCumulativeX128s[0]).toEqual(80306968154129351724602027n)
        expect(observe.secondsPerLiquidityCumulativeX128s[1]).toEqual(80306968091089242262019311n)
        expect(observe.secondsPerLiquidityCumulativeX128s[2]).toEqual(80306967523728257098774862n)

        expect(observe.tickCumulatives[0]).toEqual(-22917671856080n)
        expect(observe.tickCumulatives[1]).toEqual(-22917669092880n)
        expect(observe.tickCumulatives[2]).toEqual(-22917644224080n)
      })
    })

    describe('#rpcIncreaseObservationCardinalityNext', () => {
      it('correctly calls increaseObservationCardinalityNext', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })

        expectedMockedTransactionHash = '0x9f74329280ed4494552f14d34965195cc204f0b23b28633719826b93c013df85'
        const result = await pool.rpcIncreaseObservationCardinalityNext({
          observationCardinalityNext: 1000,
          signer: signer,
        })

        expect(result.v).toEqual(0)
        expect(result.r).toEqual('0xa1a673155da9f49f277ff0067a65b265d30b1c95f13fe0551fb3b3a2dfcba98a')
        expect(result.s).toEqual('0x49d7fa4d924e86a37b5424a6207b3c16209a9cbb4858c2ea9a73a49bc63848f2')
      })
    })

    describe('#rpcCollect', () => {
      it('correctly calls collect', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })

        expectedMockedTransactionHash = '0x66e09359a488d299735c7bb150835d93f9963cab273e98a154bebebacea38dd5'
        const result = await pool.rpcCollect({
          amount0Requested: BigInt('0xDE0B6B3A7640000'),
          amount1Requested: BigInt('0x3635C9ADC5DEA00000'),
          recipient: signer.address,
          signer: signer,
          tickLower: TickMath.MIN_TICK + 2,
          tickUpper: TickMath.MAX_TICK - 2,
        })

        expect(result.v).toEqual(1)
        expect(result.r).toEqual('0xad64fa5ea00a49f50658105fed0a70e4d44afc129271af0be968de452a8354c2')
        expect(result.s).toEqual('0x4cbb0c35de18c48478c437e243a8380503fc4cb23c6c90b24de5ddba706c275c')
      })
    })

    describe('#rpcBurn', () => {
      it('correctly calls burn', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })

        expectedMockedTransactionHash = '0x2d64d7a6bcfa93e7ba79bf868a8e06c03397aea27676c25cec606519c0da5314'
        const result = await pool.rpcBurn({
          amount: BigInt('0xDE0B6B3A7640000'),
          signer: signer,
          tickLower: TickMath.MIN_TICK + 2,
          tickUpper: TickMath.MAX_TICK - 2,
        })

        expect(result.v).toEqual(1)
        expect(result.r).toEqual('0x88079f7ec65b9e3063c793e2649d6609883517ad7650837e75553990b2c65eb3')
        expect(result.s).toEqual('0x520b615f851156545c8760f77df66f6542f32eb8f38af6a2bd750701d4393d4f')
      })
    })
  })
})
