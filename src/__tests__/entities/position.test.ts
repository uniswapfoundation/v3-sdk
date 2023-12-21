import { Percent, Token } from '@uniswap/sdk-core'
import JSBI from 'jsbi'
import { FeeAmount, TICK_SPACINGS } from 'src/constants'
import { encodeSqrtRatioX96 } from 'src/utils/encodeSqrtRatioX96'
import { nearestUsableTick } from 'src/utils/nearestUsableTick'
import { TickMath } from 'src/utils/tickMath'
import { Pool } from 'src/entities/pool'
import { Position } from 'src/entities/position'
import { ethers } from 'ethers'
import getBlock from '../stubs/calls/getBlock.json'
import callResults from '../stubs/calls/callResults.json'

let expectedMockedTransactionHash = ''
class PositionMockProvider extends ethers.providers.BaseProvider {
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

describe('Position', () => {
  const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
  const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')
  const POOL_SQRT_RATIO_START = encodeSqrtRatioX96(100e6, 100e18)
  const POOL_TICK_CURRENT = TickMath.getTickAtSqrtRatio(POOL_SQRT_RATIO_START)
  const TICK_SPACING = TICK_SPACINGS[FeeAmount.LOW]
  const DAI_USDC_POOL = new Pool(DAI, USDC, FeeAmount.LOW, POOL_SQRT_RATIO_START, 0, POOL_TICK_CURRENT, [])

  it('can be constructed around 0 tick', () => {
    const position = new Position({
      pool: DAI_USDC_POOL,
      liquidity: 1,
      tickLower: -10,
      tickUpper: 10,
    })
    expect(position.liquidity).toEqual(JSBI.BigInt(1))
  })

  it('can use min and max ticks', () => {
    const position = new Position({
      pool: DAI_USDC_POOL,
      liquidity: 1,
      tickLower: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACING),
      tickUpper: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACING),
    })
    expect(position.liquidity).toEqual(JSBI.BigInt(1))
  })

  it('tick lower must be less than tick upper', () => {
    expect(
      () =>
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 1,
          tickLower: 10,
          tickUpper: -10,
        })
    ).toThrow('TICK_ORDER')
  })

  it('tick lower cannot equal tick upper', () => {
    expect(
      () =>
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 1,
          tickLower: -10,
          tickUpper: -10,
        })
    ).toThrow('TICK_ORDER')
  })

  it('tick lower must be multiple of tick spacing', () => {
    expect(
      () =>
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 1,
          tickLower: -5,
          tickUpper: 10,
        })
    ).toThrow('TICK_LOWER')
  })

  it('tick lower must be greater than MIN_TICK', () => {
    expect(
      () =>
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 1,
          tickLower: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACING) - TICK_SPACING,
          tickUpper: 10,
        })
    ).toThrow('TICK_LOWER')
  })

  it('tick upper must be multiple of tick spacing', () => {
    expect(
      () =>
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 1,
          tickLower: -10,
          tickUpper: 15,
        })
    ).toThrow('TICK_UPPER')
  })

  it('tick upper must be less than MAX_TICK', () => {
    expect(
      () =>
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 1,
          tickLower: -10,
          tickUpper: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACING) + TICK_SPACING,
        })
    ).toThrow('TICK_UPPER')
  })

  describe('#amount0', () => {
    it('is correct for price above', () => {
      expect(
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e12,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        }).amount0.quotient.toString()
      ).toEqual('49949961958869841')
    })
    it('is correct for price below', () => {
      expect(
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING,
        }).amount0.quotient.toString()
      ).toEqual('0')
    })
    it('is correct for in-range position', () => {
      expect(
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        }).amount0.quotient.toString()
      ).toEqual('120054069145287995769396')
    })
  })

  describe('#amount1', () => {
    it('is correct for price above', () => {
      expect(
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        }).amount1.quotient.toString()
      ).toEqual('0')
    })
    it('is correct for price below', () => {
      expect(
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING,
        }).amount1.quotient.toString()
      ).toEqual('49970077052')
    })
    it('is correct for in-range position', () => {
      expect(
        new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        }).amount1.quotient.toString()
      ).toEqual('79831926242')
    })
  })

  describe('#mintAmountsWithSlippage', () => {
    describe('0 slippage', () => {
      const slippageTolerance = new Percent(0)

      it('is correct for positions below', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('49949961958869841738198')
        expect(amount1.toString()).toEqual('0')
      })

      it('is correct for positions above', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING,
        })

        const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('0')
        expect(amount1.toString()).toEqual('49970077053')
      })

      it('is correct for positions within', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('120054069145287995740584')
        expect(amount1.toString()).toEqual('79831926243')
      })
    })

    describe('.05% slippage', () => {
      const slippageTolerance = new Percent(5, 10000)

      it('is correct for positions below', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('49949961958869841738198')
        expect(amount1.toString()).toEqual('0')
      })

      it('is correct for positions above', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING,
        })

        const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('0')
        expect(amount1.toString()).toEqual('49970077053')
      })

      it('is correct for positions within', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('95063440240746211432007')
        expect(amount1.toString()).toEqual('54828800461')
      })
    })

    describe('5% slippage tolerance', () => {
      const slippageTolerance = new Percent(5, 100)

      it('is correct for pool at min price', () => {
        const position = new Position({
          pool: new Pool(DAI, USDC, FeeAmount.LOW, TickMath.MIN_SQRT_RATIO, 0, TickMath.MIN_TICK, []),
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('49949961958869841754181')
        expect(amount1.toString()).toEqual('0')
      })

      it('is correct for pool at max price', () => {
        const position = new Position({
          pool: new Pool(
            DAI,
            USDC,
            FeeAmount.LOW,
            JSBI.subtract(TickMath.MAX_SQRT_RATIO, JSBI.BigInt(1)),
            0,
            TickMath.MAX_TICK - 1,
            []
          ),
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('0')
        expect(amount1.toString()).toEqual('50045084659')
      })
    })
  })

  describe('#burnAmountsWithSlippage', () => {
    describe('0 slippage', () => {
      const slippageTolerance = new Percent(0)

      it('is correct for positions below', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('49949961958869841754181')
        expect(amount1.toString()).toEqual('0')
      })

      it('is correct for positions above', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING,
        })

        const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('0')
        expect(amount1.toString()).toEqual('49970077052')
      })

      it('is correct for positions within', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('120054069145287995769396')
        expect(amount1.toString()).toEqual('79831926242')
      })
    })

    describe('.05% slippage', () => {
      const slippageTolerance = new Percent(5, 10000)

      it('is correct for positions below', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })
        const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('49949961958869841754181')
        expect(amount1.toString()).toEqual('0')
      })

      it('is correct for positions above', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING,
        })
        const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('0')
        expect(amount1.toString()).toEqual('49970077052')
      })

      it('is correct for positions within', () => {
        const position = new Position({
          pool: DAI_USDC_POOL,
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })
        const { amount0, amount1 } = position.burnAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('95063440240746211454822')
        expect(amount1.toString()).toEqual('54828800460')
      })
    })

    describe('5% slippage tolerance', () => {
      const slippageTolerance = new Percent(5, 100)

      it('is correct for pool at min price', () => {
        const position = new Position({
          pool: new Pool(DAI, USDC, FeeAmount.LOW, TickMath.MIN_SQRT_RATIO, 0, TickMath.MIN_TICK, []),
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('49949961958869841738198')
        expect(amount1.toString()).toEqual('0')
      })

      it('is correct for pool at max price', () => {
        const position = new Position({
          pool: new Pool(
            DAI,
            USDC,
            FeeAmount.LOW,
            JSBI.subtract(TickMath.MAX_SQRT_RATIO, JSBI.BigInt(1)),
            0,
            TickMath.MAX_TICK - 1,
            []
          ),
          liquidity: 100e18,
          tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
          tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
        })

        const { amount0, amount1 } = position.mintAmountsWithSlippage(slippageTolerance)
        expect(amount0.toString()).toEqual('0')
        expect(amount1.toString()).toEqual('50045084660')
      })
    })
  })

  describe('#mintAmounts', () => {
    it('is correct for price above', () => {
      const { amount0, amount1 } = new Position({
        pool: DAI_USDC_POOL,
        liquidity: 100e18,
        tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING,
        tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
      }).mintAmounts
      expect(amount0.toString()).toEqual('49949961958869841754182')
      expect(amount1.toString()).toEqual('0')
    })
    it('is correct for price below', () => {
      const { amount0, amount1 } = new Position({
        pool: DAI_USDC_POOL,
        liquidity: 100e18,
        tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
        tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING,
      }).mintAmounts
      expect(amount0.toString()).toEqual('0')
      expect(amount1.toString()).toEqual('49970077053')
    })
    it('is correct for in-range position', () => {
      const { amount0, amount1 } = new Position({
        pool: DAI_USDC_POOL,
        liquidity: 100e18,
        tickLower: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) - TICK_SPACING * 2,
        tickUpper: nearestUsableTick(POOL_TICK_CURRENT, TICK_SPACING) + TICK_SPACING * 2,
      }).mintAmounts
      // note these are rounded up
      expect(amount0.toString()).toEqual('120054069145287995769397')
      expect(amount1.toString()).toEqual('79831926243')
    })
  })

  // RPC Testing

  describe('#rpc', () => {
    // Mock provider used in all provider function calls
    const signer = new ethers.Wallet('0xd2e184729775354772525ce7a76299efc4a6e157075940d0caa79729f75ed8b4')
    const mockProvider = new PositionMockProvider(1)

    describe('#fetchWithPositionId', () => {
      it('correctly fetches position by id', async () => {
        const position = await Position.fetchWithPositionId({ provider: mockProvider, positionId: BigInt('626818') })

        expect(position.tickLower).toEqual(-199860)
        expect(position.tickUpper).toEqual(-199260)
        expect(position._liquidity).toEqual(2573653042628834352n)
        expect(position.positionId).toEqual(626818n)
      })
    })

    describe('#getPositionCount', () => {
      it('correctly fetches position count by address', async () => {
        const positionCount = await Position.getPositionCount({
          provider: mockProvider,
          address: '0x0981eE7b1dB63bc7928eA454B52EeaC4203AFC7e',
        })

        expect(positionCount).toEqual(14n)
      })
    })

    describe('#getPositionForAddressAndIndex', () => {
      it('correctly fetches position by address and index', async () => {
        const position = await Position.getPositionForAddressAndIndex({
          provider: mockProvider,
          address: '0x0981eE7b1dB63bc7928eA454B52EeaC4203AFC7e',
          index: 0,
        })

        expect(position.tickLower).toEqual(1263)
        expect(position.tickUpper).toEqual(1268)
        expect(position._liquidity).toEqual(0n)
        expect(position.positionId).toEqual(547575n)
      })
    })

    describe('#mint', () => {
      it('correctly mints position', async () => {
        const pool = await Pool.initFromChain({ provider: mockProvider, tokenA: USDC, tokenB: DAI, fee: FeeAmount.LOW })
        const position = Position.fromAmount0({
          pool: pool,
          tickLower: TickMath.MIN_TICK + 2,
          tickUpper: TickMath.MAX_TICK - 2,
          amount0: BigInt('1000000000000000000000'),
          useFullPrecision: true,
        })

        expectedMockedTransactionHash = '0x62f76d98bea00f72f80064da0cb8a67837cb4abb79f4f9ffee4bcdc367170369'
        const result = await position.mint({
          signer: signer,
          provider: mockProvider,
          options: {
            deadline: BigInt('1000000000000000000000'),
            recipient: signer.address,
            slippageTolerance: new Percent(1, 1000),
          },
        })

        expect(result.v).toEqual(0)
        expect(result.r).toEqual('0x6440524d52c897744fe07fc86c1a081d42fb9c0ff165b6b25c286fb83844a183')
        expect(result.s).toEqual('0x26e1547a905ce9dde45969827bb08f462b69d3852eb89309aad23ffcca0f8507')
      })
    })

    describe('#increasePositionByPercentageOnChain', () => {
      it('correctly increases position', async () => {
        const position = await Position.fetchWithPositionId({ provider: mockProvider, positionId: BigInt('626818') })

        expectedMockedTransactionHash = '0x524be0f419bce3be9c432e8e37c2503be72e4c7c6c512a97bbf66788cc2a936c'
        const result = await position.increasePositionByPercentageOnChain({
          signer: signer,
          provider: mockProvider,
          options: {
            deadline: BigInt('1000000000000000000000'),
            slippageTolerance: new Percent(1, 1000),
            tokenId: position.positionId!,
          },
          percentage: new Percent(50, 100),
        })

        expect(result.v).toEqual(0)
        expect(result.r).toEqual('0x9adfa7475466890f5711571ecb9ca6019ceedafa5c9027bd9e65e9483d7b1881')
        expect(result.s).toEqual('0x5b63dad7fb23bc4257064ebf5bb66254988da295a66195e9411f6ce89854a1c6')
      })
    })

    describe('#decreasePositionByPercentageOnChain', () => {
      it('correctly decreases position', async () => {
        const position = await Position.fetchWithPositionId({ provider: mockProvider, positionId: BigInt('626818') })

        expectedMockedTransactionHash = '0x385d9722d5b6e33f74ad484a0e1925130502966038595d0a99cbbf6491e59321'
        const result = await position.decreasePositionByPercentageOnChain({
          signer: signer,
          provider: mockProvider,
          options: {
            deadline: BigInt('1000000000000000000000'),
            slippageTolerance: new Percent(1, 1000),
            tokenId: position.positionId!,
          },
          percentage: new Percent(50, 100),
        })

        expect(result.v).toEqual(0)
        expect(result.r).toEqual('0x3cab6f4fb86f6c56fd4c9f17f762cbe4b65cb98cebb9b731d1b8197a7c4ba58f')
        expect(result.s).toEqual('0x382304bc1081f9bbff05350b847a51d0b71764195692eb7788201f0cb245743c')
      })
    })

    describe('#collectFeesOnChain', () => {
      it('correctly collects fees from position', async () => {
        const position = await Position.fetchWithPositionId({ provider: mockProvider, positionId: BigInt('626818') })

        expectedMockedTransactionHash = '0x6d58647a4007558187e1ab9f49172d3597df0c056b9d4270c42ddc480dfdad24'
        const result = await position.collectFeesOnChain({
          signer: signer,
          provider: mockProvider,
          percentage: new Percent(50, 100),
        })

        expect(result.v).toEqual(1)
        expect(result.r).toEqual('0xefef2f216923ce166265899f1edb6555752de615a58c52426ca8e3f3578a5250')
        expect(result.s).toEqual('0x3d0fa75400ddcf69cba79deb75d6835dbd7a9105b666c1b422e29f9a5bddf0ef')
      })
    })
  })
})
