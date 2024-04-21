import { utils } from 'ethers'

// import { bytecode } from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'
// export const POOL_BYTECODE_HASH = utils.keccak256(bytecode)

export function computePoolAddress(
  factoryAddress: string,
  poolImplementationAddress: string,
  [tokenA, tokenB]: [string, string],
  fee: number
): string {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
  const constructorArgumentsEncoded = utils.defaultAbiCoder.encode(
    ['address', 'address', 'uint24'],
    [token0, token1, fee]
  )

  // 0xd7862af7a62fd5ba07fa2439e5dd8d59e68cb6f850940bd873b22989360f735f
  const POOL_BYTECODE_HASH = utils.solidityKeccak256(
    ['bytes10', 'bytes10', 'bytes20', 'bytes15'],
    ['0x3d602d80600a3d3981f3', '0x363d3d373d3d3d363d73', poolImplementationAddress, '0x5af43d82803e903d91602b57fd5bf3']
  )

  // console.log(POOL_BYTECODE_HASH)

  const create2Inputs = [
    '0xff',
    factoryAddress,
    // salt
    utils.keccak256(constructorArgumentsEncoded),
    // init code hash
    POOL_BYTECODE_HASH,
  ]
  const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join('')}`
  return utils.getAddress(`0x${utils.keccak256(sanitizedInputs).slice(-40)}`)
}
