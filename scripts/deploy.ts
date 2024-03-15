import fs from 'fs'
import hre from 'hardhat'

import { deploy } from './utils/deployment-create3'

import { asciiStringToBytes32 } from './utils/asciiStringToBytes32'
import {} from '../typechain'
const { ethers, network } = hre

const addresses = fs.existsSync(`addresses.${network.name}.json`)
  ? JSON.parse(fs.readFileSync(`addresses.${network.name}.json`, 'utf-8'))
  : {}

async function main() {
  let WETH9, PearlV2Factory

  const [signer, user0] = await ethers.getSigners()

  console.log('Deploying Contracts...')

  if (['hardhat', 'localhost'].includes(network.name)) {
    // await network.provider.send('evm_setIntervalMining', [3000])
    // fs.writeFileSync(`addresses.${network.name}.json`, '{}', 'utf-8')
    WETH9 = await deploy('ERC20', 'WETH99', ['Wrapped ETH', 'WETH']).then((c) => c.address)
  } else if (network.name === 'mumbai') {
    // WETH9 = await deploy('ERC20', 'WETH99', ['Wrapped ETH', 'WETH']).then((c) => c.address)
    WETH9 = addresses.WETH9
  } else if (network.name === 'unreal') {
    WETH9 = addresses.WETH9
  } else {
    WETH9 = addresses.WETH9
  }

  PearlV2Factory = addresses.PearlV2Factory

  const latest = await signer.getTransactionCount('latest')
  const pending = await signer.getTransactionCount('pending')

  console.log(latest)
  console.log(pending)

  if (latest < pending) {
    await signer.sendTransaction({
      to: ethers.constants.AddressZero,
      value: 0,
      nonce: latest,
    })
    process.exit(0)
  }

  // ############# Periphery ####################
  // Use auto router 02
  const swapRouter = await deploy('SwapRouter', [PearlV2Factory, WETH9])
  const quoterV2 = await deploy('QuoterV2', [PearlV2Factory, WETH9])

  //https://forum.openzeppelin.com/t/oz-hardhat-upgrades-unsafeallow-external-library-linking-error/38100
  const nFTDescriptorLibraryAddress = await deploy('NFTDescriptor').then((contract) => contract.address)
  const desriptor = await deploy('NonfungibleTokenPositionDescriptor', [WETH9, asciiStringToBytes32('ETH')], [], {
    libraries: { NFTDescriptor: nFTDescriptorLibraryAddress },
  })
  const positionManager = await deploy('NonfungiblePositionManager', [PearlV2Factory, WETH9, desriptor.address])
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
