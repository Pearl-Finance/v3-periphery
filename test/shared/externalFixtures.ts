// import {
//   abi as FACTORY_ABI,
//   bytecode as FACTORY_BYTECODE,
// } from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'
import { abi as FACTORY_V2_ABI, bytecode as FACTORY_V2_BYTECODE } from '@uniswap/v2-core/build/UniswapV2Factory.json'
import { Fixture } from 'ethereum-waffle'
import { ethers, waffle, deployments } from 'hardhat'
import { IUniswapV3Factory, IPearlV2Factory, IPearlV2Pool, IWETH9, MockTimeSwapRouter } from '../../typechain'

import WETH9 from '../contracts/WETH9.json'
import { Contract } from '@ethersproject/contracts'
import { constants } from 'ethers'

import dex from '../contracts/dex.json'

import { deployContract, deployFactory, getCreate2Address, isDeployed } from 'solidity-create2-deployer'

const wethFixture: Fixture<{ weth9: IWETH9 }> = async ([wallet]) => {
  const weth9 = (await waffle.deployContract(wallet, {
    bytecode: WETH9.bytecode,
    abi: WETH9.abi,
  })) as IWETH9

  return { weth9 }
}

export const v2FactoryFixture: Fixture<{ factory: Contract }> = async ([wallet]) => {
  const factory = await waffle.deployContract(
    wallet,
    {
      bytecode: FACTORY_V2_BYTECODE,
      abi: FACTORY_V2_ABI,
    },
    [constants.AddressZero]
  )

  return { factory }
}

const v3CoreFactoryFixture: Fixture<{
  poolImplementation: IPearlV2Pool
  factory: IPearlV2Factory
}> = async ([wallet]) => {
  const SqrtPriceMathV2Lib = (await waffle.deployContract(wallet, {
    bytecode: dex.SqrtPriceMathV2Lib.bytecode.object,
    abi: dex.SqrtPriceMathV2Lib.abi,
  })) as Contract

  const LiquidityAmountsV2Lib = await waffle.deployContract(wallet, {
    bytecode: dex.LiquidityAmountsV2Lib.bytecode.object,
    abi: dex.LiquidityAmountsV2Lib.abi,
  })

  const SwapMathV2Lib = await waffle.deployContract(wallet, {
    bytecode: dex.SwapMathV2Lib.bytecode.object,
    abi: dex.SwapMathV2Lib.abi,
  })

  // console.log(
  //   'xxx',
  //   getLibraryPlaceholderStr('contracts/libraries/SqrtPriceMathV2.sol:SqrtPriceMathV2'),
  //   SqrtPriceMathV2Lib.address.toLowerCase()
  // )

  // console.log(
  //   'xxx',
  //   getLibraryPlaceholderStr('contracts/libraries/LiquidityAmountsV2.sol:LiquidityAmountsV2'),
  //   LiquidityAmountsV2Lib.address.toLowerCase()
  // )

  // console.log(
  //   'xxx',
  //   getLibraryPlaceholderStr('contracts/libraries/SwapMathV2.sol:SwapMathV2'),
  //   SwapMathV2Lib.address.toLowerCase()
  // )

  // const poolImplementation = (await waffle.deployContract(wallet, {
  //   bytecode: dex.pool.bytecode.object,
  //   abi: dex.pool.abi,
  // })) as IPearlV2Pool

  const poolFactory = await deployments.deterministic('PearlV2Pool', {
    from: wallet.address,
    contract: {
      abi: dex.pool.abi,
      bytecode: dex.pool.bytecode.object,
    },
    salt: ethers.utils.solidityKeccak256(['string'], ['SALT_V1']),
  })

  const code = await ethers.provider.getCode(poolFactory.address)
  if (code === '0x') {
    const deployed = await poolFactory.deploy()
  }
  const poolImplementation = (await ethers.getContractAt(dex.pool.abi, poolFactory.address, wallet)) as IPearlV2Pool

  const factory = (await waffle.deployContract(
    wallet,
    {
      bytecode: dex.factory.bytecode.object,
      abi: dex.factory.abi,
    },
    [wallet.address, poolImplementation.address]
  )) as IPearlV2Factory

  return { poolImplementation, factory }
}

export const v3RouterFixture: Fixture<{
  weth9: IWETH9
  factory: IPearlV2Factory
  poolImplementation: IPearlV2Pool
  router: MockTimeSwapRouter
}> = async ([wallet], provider) => {
  const { weth9 } = await wethFixture([wallet], provider)
  const { factory, poolImplementation } = await v3CoreFactoryFixture([wallet], provider)

  const router = (await (await ethers.getContractFactory('MockTimeSwapRouter')).deploy(
    factory.address,
    weth9.address
  )) as MockTimeSwapRouter

  return { factory, poolImplementation, weth9, router }
}

function getLibraryPlaceholderStr(name: string) {
  // https://github.com/ethers-io/ethers.js/issues/195#issuecomment-1212815642
  // name "contracts/libraries/SqrtPriceMathV2.sol:SqrtPriceMathV2"
  return `__\$${ethers.utils.solidityKeccak256(['string'], [name]).slice(2, 36)}\$__`
}
