import 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
import { workerEvents } from '../events/constants.js';
let _globalCtx = {};
let _model = {}

const WEIGHTS = {
    category: 0.4,
    color:0.3,
    price: 0.2,
    age: 0.1,
};

// Normalize continuous values (price, age) to 0-1 range
//Why? Keeps all features balanced so no one dominates training
// Formula: (val - min) / (max - min)
// Exeample: price=129.99, minPrice=39.99, maxPrice=199.99 -> 0.56
const normalize = (value, min, max) => (value - min) / ((max - min) || 1) 

function makeContext(products, users) {
    const ages = users.map(u => u.age)
    const prices = products.map(p => p.price)

    const minAge = Math.min(...ages)
    const maxAge = Math.max(...ages)

    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)

    const colors = [...new Set(products.map(p => p.color))]
    const categories = [...new Set(products.map(p => p.category))]

    const colorsIndex = Object.fromEntries(
        colors.map((color, index) => {
            return [color, index]
        })
    )
    
    const categoriesIndex = Object.fromEntries(
        categories.map((category, index) => {
            return [category, index]
        })
    )
    
    //Computar a média de idade dos compradores por produto
    // (ajuda a personalizar)
    const midAge = (minAge + maxAge) / 2
    const ageSums = {}
    const ageCounts = {}

    users.forEach(user => {
        user.purchases.forEach(p => {
            ageSums[p.name] = (ageSums[p.name] || 0) + user.age
            ageCounts[p.name] = (ageCounts[p.name] || 0) + 1
        })
    })

    const productAvgAgeNorm = Object.fromEntries(
        products.map(product => {
            const avg = ageCounts[product.name] ? 
            ageSums[product.name] / ageCounts[product.name] :
            midAge

            return [product.name, normalize(avg, minAge, maxAge)]
        })
    )

    return {
        products,
        users,
        colorsIndex,
        categoriesIndex,
        minAge,
        maxAge,
        minPrice,
        maxPrice,
        numCategories: categories.length,
        numColors: colors.length,
        productAvgAgeNorm,
        // price + age + colors + categories
        dimensions: 2 +  categories.length + colors.length
    }

}

const oneHotWeighted = (index, length, weight) =>
    tf.oneHot(index, length).cast('float32').mul(weight)
function encodeProduct(product, context) {
    // normalizando dados para ficar de 0 a 1 e
    // aplicar o peso na recomendação
    const price = tf.tensor1d([
        normalize(
            product.price, 
            context.minPrice, 
            context.maxPrice
        ) * WEIGHTS.price
    ])

    const age = tf.tensor1d([
        (
            context.productAvgAgeNorm[product.name] ?? 0.5
        ) * WEIGHTS.age
    ])

    const category = oneHotWeighted(
        context.categoriesIndex[product.category],
        context.numCategories,
        WEIGHTS.category
    )

    const color = oneHotWeighted(
        context.colorsIndex[product.color],
        context.numColors,
        WEIGHTS.color
    )

    return tf.concat1d(
        [price, age, category, color]
    )
}

function encodeUser(user, context) {
    if(user.purchases.length) {
        return tf.stack(
            user.purchases.map(
                product => encodeProduct(product, context)
            )
        )
        .mean(0)
        .reshape([
            1,
            context.dimensions
        ])
    }
}

function createTrainingData(context){
    const inputs = []
    const labels = []
    context.users.forEach(user => {
        const userVector = encodeUser(user, context).dataSync()
        context.products.forEach(product => {
            const productVector = encodeProduct(product, context).dataSync()

            const label = user.purchases.some(
                purchase => purchase.name === product.name ? 1 : 0
            )
            //Combinar usuario e produto
            inputs.push([...userVector, ...productVector])
            labels.push(label)
        })
    })
    
    return {
        xs: tf.tensor2d(inputs),
        ys: tf.tensor2d(labels, [labels.length]),
        inputDimention: context.dimensions * 2
        // tamanho = userVerctor + productVector
    }
}

function configureNeuralNetAndTrain(trainData){

}

async function trainModel({ users }) {
    console.log('Training model with users:', users);
    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 1 } });
    const products = await (await fetch('/data/products.json')).json()

    const context = makeContext(products, users)
    context.productVectors = products.map(product => {
            return {
                name: product.name,
                meta: {...product},
                vector: encodeProduct(product, context).dataSync()
            }
        })

    _globalCtx = context

    const trainData = createTrainingData(context)
    _model = configureNeuralNetAndTrain
    debugger

    postMessage({
        type: workerEvents.trainingLog,
        epoch: 1,
        loss: 1,
        accuracy: 1
    });

    setTimeout(() => {
    postMessage({ type: workerEvents.progressUpdate, progress: { progress: 100 } });
    postMessage({ type: workerEvents.trainingComplete })
    }, 1000)
}
function recommend({ user }) {
    console.log('will recommend for user:', user);
}
const handlers = {
    [workerEvents.trainModel]: trainModel,
    [workerEvents.recommend]: recommend,
};

self.onmessage = e => {
    const { action, ...data } = e.data;
    if (handlers[action]) handlers[action](data);
};
