import { Token } from '@uniswap/sdk-core'
import { FeeAmount, Tick } from '../index.js'
import { ethers } from 'ethers'
import poolAbi from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'
import { AbiCoder } from '@ethersproject/abi'
import { keccak256 } from '@ethersproject/keccak256'
import { toUtf8Bytes } from '@ethersproject/strings'
import { BytesLike } from '@ethersproject/bytes'

export interface PoolData {
  address: string
  tokenA: Token
  tokenB: Token
  fee: FeeAmount
  sqrtPriceX96: BigInt
  liquidity: BigInt
  tick: number
  tickSpacing: number
}

export abstract class RPCPool {
  public static async getPoolData(
    provider: ethers.providers.Provider,
    poolAddress: string,
    blockNum: number
  ): Promise<PoolData> {
    const poolContract = new ethers.Contract(poolAddress, poolAbi.abi, provider)

    const [slot0, liquidity, tickSpacing, fee, token0, token1] = await Promise.all([
      poolContract.slot0({
        blockTag: blockNum,
      }),
      poolContract.liquidity({
        blockTag: blockNum,
      }),
      poolContract.tickSpacing({
        blockTag: blockNum,
      }),
      poolContract.fee({
        blockTag: blockNum,
      }),
      poolContract.token0({
        blockTag: blockNum,
      }),
      poolContract.token1({
        blockTag: blockNum,
      }),
    ])
    return {
      address: poolAddress,
      tokenA: token0,
      tokenB: token1,
      fee: fee,
      sqrtPriceX96: BigInt(slot0.sqrtPriceX96.toString()),
      liquidity: BigInt(liquidity.toString()),
      tick: parseInt(slot0.tick),
      tickSpacing: tickSpacing,
    }
  }

  public static async getTickIndicesInWordRange(
    provider: ethers.providers.Provider,
    poolAddress: string,
    tickSpacing: number,
    startWord: number,
    endWord: number
  ): Promise<number[]> {
    const poolContract = new ethers.Contract(poolAddress, poolAbi.abi)

    const calls: any[] = []
    const wordPosIndices: number[] = []

    for (let i = startWord; i <= endWord; i++) {
      wordPosIndices.push(i)
      calls.push(this.makeMulticallFunction(poolContract, 'tickBitmap')(i))
    }

    const results: bigint[] = (await this.multicall(calls, provider)).map((ethersResponse: any) => {
      return BigInt(ethersResponse.toString())
    })

    const tickIndices: number[] = []

    for (let j = 0; j < wordPosIndices.length; j++) {
      const ind = wordPosIndices[j]
      const bitmap = results[j]

      if (bitmap !== 0n) {
        for (let i = 0; i < 256; i++) {
          const bit = 1n
          const initialized = (bitmap & (bit << BigInt(i))) !== 0n
          if (initialized) {
            const tickIndex = (ind * 256 + i) * tickSpacing
            tickIndices.push(tickIndex)
          }
        }
      }
    }

    return tickIndices
  }

  public static async getAllTicks(
    provider: ethers.providers.Provider,
    poolAddress: string,
    tickIndices: number[]
  ): Promise<Tick[]> {
    const poolContract = new ethers.Contract(poolAddress, poolAbi.abi)

    const calls: any[] = []

    for (const index of tickIndices) {
      calls.push(this.makeMulticallFunction(poolContract, 'ticks')(index))
    }

    const results = await this.multicall(calls, provider)
    const allTicks: Tick[] = []

    for (let i = 0; i < tickIndices.length; i++) {
      const index = tickIndices[i]
      const ethersResponse = results[i]
      const tick = new Tick({
        index,
        liquidityGross: BigInt(ethersResponse.liquidityGross.toString()),
        liquidityNet: BigInt(ethersResponse.liquidityNet.toString()),
      })
      allTicks.push(tick)
    }
    return allTicks
  }

  // Helpers for multicall

  private static makeMulticallFunction(contract: ethers.Contract, name: string): (...params: any[]) => ContractCall {
    return (...params: any[]) => {
      const { address } = contract
      const { inputs } =
        contract.interface.functions[name] || Object.values(contract.interface.functions).find((f) => f.name === name)
      const { outputs } =
        contract.interface.functions[name] || Object.values(contract.interface.functions).find((f) => f.name === name)
      return {
        contract: {
          address: address,
        },
        name: name,
        inputs: inputs || [],
        outputs: outputs || [],
        params: params,
      }
    }
  }

  private static multicallGetFunctionSignature(name: string, inputs: ethers.utils.ParamType[]): string {
    const types = []
    for (const input of inputs) {
      if (input.type === 'tuple') {
        const tupleString = this.multicallGetFunctionSignature('', input.components)
        types.push(tupleString)
        continue
      }
      if (input.type === 'tuple[]') {
        const tupleString = this.multicallGetFunctionSignature('', input.components)
        const arrayString = `${tupleString}[]`
        types.push(arrayString)
        continue
      }
      types.push(input.type)
    }
    const typeString = types.join(',')
    const functionSignature = `${name}(${typeString})`
    return functionSignature
  }

  private static makeMulticallCallData(name: string, inputs: ethers.utils.ParamType[], params: any[]) {
    const functionSignature = this.multicallGetFunctionSignature(name, inputs)
    const functionHash = keccak256(toUtf8Bytes(functionSignature))
    const functionData = functionHash.substring(2, 10)
    const abiCoder = new AbiCoder()
    const argumentString = abiCoder.encode(inputs, params)
    const argumentData = argumentString.substring(2)
    const inputData = `0x${functionData}${argumentData}`
    return inputData
  }

  private static fromMulticallResult(outputs: ethers.utils.ParamType[], data: BytesLike) {
    const abiCoder = new AbiCoder()
    const params = abiCoder.decode(outputs, data)
    return params
  }

  private static async multicall<T extends any[] = any[]>(
    calls: ContractCall[],
    provider: ethers.providers.Provider
  ): Promise<T> {
    // Multicall3 address deployed on 100+ chains. Code cannot be changed and
    // nothing else can be deployed on this address on any chain.
    // So if a chain ever doesn't have the deployment yet, the function will
    // throw. Which is what we want.
    // https://github.com/mds1/multicall
    const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11'
    const multicallAbi = [
      'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)',
    ]

    const multicall = new ethers.Contract(multicallAddress, multicallAbi, provider)
    const callRequests = calls.map((call) => {
      const callData = this.makeMulticallCallData(call.name, call.inputs, call.params)
      return {
        target: call.contract.address,
        allowFailure: false,
        callData: callData,
      }
    })
    const response = await multicall.callStatic.aggregate3(callRequests)
    const callCount = calls.length
    const callResult = [] as unknown as T
    for (let i = 0; i < callCount; i++) {
      const outputs = calls[i].outputs
      const returnData = response[i].returnData
      const params = this.fromMulticallResult(outputs, returnData)
      const result = outputs.length === 1 ? params[0] : params
      callResult.push(result)
    }
    return callResult
  }
}

interface ContractCall {
  contract: {
    address: string
  }
  name: string
  inputs: ethers.utils.ParamType[]
  outputs: ethers.utils.ParamType[]
  params: any[]
}
