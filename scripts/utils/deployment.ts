import { Signer } from 'ethers'
import fs from 'fs'
import hre from 'hardhat'

const { ethers } = hre
const { network } = hre

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
  fs.appendFile(filename, verifyString, function (err) {
    // console.log(err);
  })
  // fs.writeFileSync(filename, verifyString);
}

// /**
//  * Deploys or upgrades contract and returns an instance of the contract
//  * @param {string} contractName - The name of the contract to be deployed
//  * @param {string} name - The name used to track the deployed contract
//  * @param {Array} input - The parameters to be passed to the contract's initializer function
//  * @param {Object} addresses - The parsed addresses of the deployed contracts
//  * @param {string} addressFile - The file name storing the addresses
//  * @returns {Promise<Object>} An instance of the deployed contract
//  */
// async function deployOrUpgrade(
//   contractName: string,
//   name: string,
//   input: any[],
//   addresses: any,
//   addressFile: string,
//   verifyFile: string,
//   opts?: any
// ) {
//   const existing = await hre.artifacts
//     .readArtifact(contractName)
//     .then((artifact) => artifact.deployedBytecode)
//     .catch(() => false)
//   const factory = await ethers.getContractFactory(contractName)
//   let action = 'deployed' // default action is 'deployed'

//   if (existing && addresses[name]) {
//     const implementationAddress = await upgrades.erc1967.getImplementationAddress(addresses[name])
//     const deployedBytecode = await hre.ethers.provider.getCode(implementationAddress)
//     if ((existing as string).length !== deployedBytecode.length /*|| contractName === 'Pearl'*/) {
//       const upgrade = await upgrades.upgradeProxy(addresses[name], factory, opts)
//       await upgrade.deployed()
//       action = 'upgraded'
//     }
//   } else {
//     const proxy = await upgrades.deployProxy(factory, input, {
//       initializer: 'initialize',
//     })
//     await proxy.deployed()
//     addresses[name] = proxy.address
//     action = 'newly deployed'
//     writeAddressesToFile(addressFile, addresses)
//   }

//   console.log(`${name} ${action} at ${addresses[name]}`)

//   const contract = await ethers.getContractAt(contractName, addresses[name])
//   ;(contract as any).newlyDeployed = action !== 'deployed'

//   if (contract.newlyDeployed) {
//     writeVerifyToFile(verifyFile, `\nnpx hardhat verify ${addresses[name]} --network ${network.name}`)
//     console.log(`\n  npx hardhat verify ${addresses[name]} --network ${network.name}\n`)
//   }

//   return contract
// }

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

// /**
//  * Deploys or upgrades contract and returns an instance of the contract
//  * @param {string} contractName - The name of the contract to be deployed
//  * @param {string} name - The name used to track the deployed contract
//  * @param {Array} input - The parameters to be passed to the contract's initializer function
//  * @param {Object} addresses - The parsed addresses of the deployed contracts
//  * @param {string} addressFile - The file name storing the addresses
//  * @returns {Promise<Object>} An instance of the deployed contract
//  */
// async function deployOrUpgrade(
//   contractName: string,
//   name: string,
//   input: any[],
//   addresses: any,
//   addressFile: string,
//   verifyFile: string,
//   opts?: any
// ) {
//   const existing = await hre.artifacts
//     .readArtifact(contractName)
//     .then((artifact) => artifact.deployedBytecode)
//     .catch(() => false)
//   const factory = await ethers.getContractFactory(contractName)
//   let action = 'deployed' // default action is 'deployed'

//   if (existing && addresses[name]) {
//     const implementationAddress = await upgrades.erc1967.getImplementationAddress(addresses[name])
//     const deployedBytecode = await hre.ethers.provider.getCode(implementationAddress)
//     if ((existing as string).length !== deployedBytecode.length /*|| contractName === 'Pearl'*/) {
//       const upgrade = await upgrades.upgradeProxy(addresses[name], factory, opts)
//       await upgrade.deployed()
//       action = 'upgraded'
//     }
//   } else {
//     const proxy = await upgrades.deployProxy(factory, input, {
//       initializer: 'initialize',
//     })
//     await proxy.deployed()
//     addresses[name] = proxy.address
//     action = 'newly deployed'
//     writeAddressesToFile(addressFile, addresses)
//   }

//   console.log(`${name} ${action} at ${addresses[name]}`)

//   const contract = await ethers.getContractAt(contractName, addresses[name])
//   ;(contract as any).newlyDeployed = action !== 'deployed'

//   if (contract.newlyDeployed) {
//     writeVerifyToFile(verifyFile, `\nnpx hardhat verify ${addresses[name]} --network ${network.name}`)
//     console.log(`\n  npx hardhat verify ${addresses[name]} --network ${network.name}\n`)
//   }

//   return contract
// }

// export async function deployWithProxy(
//   contractName: string,
//   name: string | any[] = contractName,
//   input: any[] = [],
//   opts?: any
// ) {
//   if (Array.isArray(name)) {
//     input = name
//     name = contractName
//   }
//   const addressFile = `addresses.${network.name}.json`
//   const verifyFile = `verify.${network.name}.txt`

//   const addresses = readAddressesFromFile(addressFile)

//   return await deployOrUpgrade(contractName, name, input, addresses, addressFile, verifyFile, opts)
// }
