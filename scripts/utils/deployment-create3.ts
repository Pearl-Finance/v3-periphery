import fs from 'fs'
import hre from 'hardhat'

const { ethers, network } = hre

const solidity = require('@ethersproject/solidity')
import { ICREATE3Factory__factory } from '../../typechain'
import { BytesLike, Signer } from 'ethers'

/**
 * Reads the existing contract addresses from the given file
 * @param {string} filename - The name of the file storing the addresses
 * @returns {Object} An object containing the parsed addresses
 */
export function readAddressesFromFile(filename: string) {
  const addresses = JSON.parse(fs.readFileSync(filename, 'utf-8'))
  return addresses
}

/**
 * Writes the updated contract addresses to the given file
 * @param {string} filename - The name of the file storing the addresses
 * @param {Object} addresses - The updated addresses to be stored
 */
function writeAddressesToFile(filename: string, addresses: any) {
  fs.writeFileSync(filename, JSON.stringify(addresses, null, 2))
}

/**
 * Writes the updated contract addresses to the given file
 * @param {string} filename - The name of the file storing the addresses
 * @param {Object} verifyString - The verify command line
 */
function writeVerifyToFile(filename: string, verifyString: string) {
  fs.appendFile(filename, verifyString, function (err) {})
  // fs.writeFileSync(filename, verifyString);
}

/**
 * Deploys or redeploys a contract and returns an instance of the contract
 * @param {string} contractName - The name of the contract to be deployed
 * @param {string} name - The name used to track the deployed contract
 * @param {Array} input - The parameters to be passed to the contract's constructor
 * @param {Object} addresses - The parsed addresses of the deployed contracts
 * @param {string} addressFile - The file name storing the addresses
 * @returns {Promise<Object>} An instance of the deployed contract
 */
async function deployOrRedeploy(
  contractName: string,
  name: string,
  input: any[],
  addresses: any,
  addressFile: string,
  verifyFile: string,
  opt?: any
) {
  const [signer] = await ethers.getSigners()
  let action = 'deployed' // default action is 'deployed'

  //initialize create3 factory and get deployed contract address
  const create3Factory = ICREATE3Factory__factory.connect(addresses.CREATE3Factory, signer)

  //get Contract factory
  const factory = await ethers.getContractFactory(contractName, opt)
  const bytecodeWithArgs = (await factory.getDeployTransaction(...input)).data as BytesLike

  // const salt = solidity.keccak256(['bytes', 'string'], [factory.bytecode, name])
  // const salt = ethers.utils.formatBytes32String(addresses.SALT); // 31 characters that you choose

  const _SALT = addresses.SALT
  const salt = ethers.utils.solidityKeccak256(['string', 'string'], [_SALT, name])
  addresses[name] = await create3Factory.getDeployed(signer.address, salt)

  if ((await ethers.provider.getCode(addresses[name])) != `0x`) {
    action = 'deployed'
    console.log(`${name} ${action} at ${addresses[name]} | Change the salt to deploy to a different address`)
  } else {
    const feeData = await ethers.provider.getFeeData()
    const txResponse = await create3Factory.deploy(salt, bytecodeWithArgs)
    await txResponse.wait()
    action = 'newly deployed'
    writeAddressesToFile(addressFile, addresses)
    console.log(`${name} ${action} at ${addresses[name]}`)
  }

  const contract = await ethers.getContractAt(contractName, addresses[name])
  ;(contract as any).newlyDeployed = action !== 'deployed'

  if (contract.newlyDeployed) {
    writeVerifyToFile(
      verifyFile,
      `\nnpx hardhat verify ${[addresses[name], ...input].map((x) => x.toString()).join(' ')} --network ${
        network.name
      }\n`
    )
    console.log(
      `\n  npx hardhat verify ${[addresses[name], ...input].map((x) => x.toString()).join(' ')} --network ${
        network.name
      }\n`
    )
  }

  return contract
}

// Wrapper functions
export async function deploy(contractName: string, name: string | any[] = contractName, input: any[] = [], opt?: any) {
  if (Array.isArray(name)) {
    input = name
    name = contractName
  }
  const addressFile = `addresses.${network.name}.json`
  const verifyFile = `verify.${network.name}.txt`

  const addresses = readAddressesFromFile(addressFile)

  return deployOrRedeploy(contractName, name, input, addresses, addressFile, verifyFile, opt)
}
/**
 * Deploys or redeploys a contract and returns an instance of the contract
 * @param {string} contractName - The name of the contract to be deployed
 * @param {string} name - The name used to track the deployed contract
 * @param {Array} input - The parameters to be passed to the contract's constructor
 * @param {Object} addresses - The parsed addresses of the deployed contracts
 * @param {string} addressFile - The file name storing the addresses
 * @returns {Promise<Object>} An instance of the deployed contract
 */
async function deployOrRedeployUsingFactory(
  contractName: string,
  name: string,
  input: any[],
  addresses: any,
  addressFile: string,
  verifyFile: string,
  opt?: any
) {
  const existing = await hre.artifacts
    .readArtifact(contractName)
    .then((artifact) => artifact.deployedBytecode)
    .catch(() => false)
  const factory = await ethers.getContractFactory(contractName, opt)
  let action = 'deployed' // default action is 'deployed'

  if (existing && addresses[name]) {
    const deployedBytecode = await hre.ethers.provider.getCode(addresses[name])
    if ((existing as string).length !== deployedBytecode.length) {
      const contract = await factory.deploy(...input)
      await contract.deployed()
      addresses[name] = contract.address
      action = 'newly deployed'
    }
  } else {
    const contract = await factory.deploy(...input)
    await contract.deployed()
    addresses[name] = contract.address
    action = 'newly deployed'
    writeAddressesToFile(addressFile, addresses)
  }

  console.log(`${name} ${action} at ${addresses[name]}`)

  const contract = await ethers.getContractAt(contractName, addresses[name])
  ;(contract as any).newlyDeployed = action !== 'deployed'

  if (contract.newlyDeployed) {
    writeVerifyToFile(
      verifyFile,
      `\nnpx hardhat verify ${[addresses[name], ...input].map((x) => x.toString()).join(' ')} --network ${
        network.name
      }\n`
    )
    console.log(
      `\n  npx hardhat verify ${[addresses[name], ...input].map((x) => x.toString()).join(' ')} --network ${
        network.name
      }\n`
    )
  }

  return contract
}

// Wrapper functions
export async function deployUsingFactory(
  contractName: string,
  name: string | any[] = contractName,
  input: any[] = [],
  opt?: any
) {
  if (Array.isArray(name)) {
    input = name
    name = contractName
  }
  const addressFile = `addresses.${network.name}.json`
  const verifyFile = `verify.${network.name}.txt`

  const addresses = readAddressesFromFile(addressFile)

  return deployOrRedeployUsingFactory(contractName, name, input, addresses, addressFile, verifyFile, opt)
}
