// To start everything: npm start, npm run tunnel, npm run dev

// Don't @ me for how bad this needs to be refactored

const express = require('express')
const { WebhookClient } = require('dialogflow-fulfillment')
const app = express()
const fetch = require('node-fetch')
const base64 = require('base-64')

const confirmPhrases = ["Ok", "Sure.", "I can do that :)", 
"No problem!", "Of course!", ":thumbsup:", "Here you go!"]

let username = "";
let password = "";
let token = "";

async function getToken () {
  let request = {
    method: 'GET',
    headers: {'Content-Type': 'application/json',
              'Authorization': 'Basic '+ base64.encode(username + ':' + password)},
    redirect: 'follow'
  }
  const serverReturn = await fetch('https://mysqlcs639.cs.wisc.edu/login',request)
  const serverResponse = await serverReturn.json()
  token = serverResponse.token
  return token;
}

app.get('/', (req, res) => res.send('online'))
app.post('/', express.json(), (req, res) => {
  const agent = new WebhookClient({ request: req, response: res })
  if (token) {
    // Post user message
    updateMessages(agent.query, true)
  }
  function welcome () {
    agent.add('Webhook works!')
  }

  // Login (0.5 pts)
  async function login () {
    username = agent.parameters.Username
    password = agent.parameters.Password
    await getToken()
    await clearMessages().then(async () => {
      await updateMessages(agent.query, true)
      await updateMessages("Ok, I signed you in as " + username);
    })
    agent.add("Logging in...")
  }

  // QUERIES
  async function getInfo (route) {
    let request = {
      method: 'GET',
      headers: {'Content-Type': 'application/json',
                'x-access-token': token},
      redirect: 'follow'
    }
    const serverReturn = await fetch('https://mysqlcs639.cs.wisc.edu/' 
      + route, request)
    const serverResponse = await serverReturn.json()
    agent.add("Getting info...")
    return serverResponse;
  }
  // Categories (0.5 pts) 
  async function queryCategories() {
    let response = await getInfo('/categories')
    let message = "The categories are " + response.categories.join(", ") + " and... \nNope! Nothing else."
    await updateMessages(message)
    agent.add("Getting information now")
  }
  // Tags (0.5 pts)

  /**
   * Returns number to indicate the type of page
   * 1: home
   * 2: category
   * 3: cart
   * 4: product
   */
  async function pageIndicator() {
    let appResponse = await getInfo('application')
    let page = appResponse.page
    if (page.toString().includes("cart")) return 3;

    return page.toString().split("/").length - 1
  }
  async function queryTags() {
    let route = ""
    let indicator = await pageIndicator()
    let app = await getInfo('/application')
    let page = app.page
    if(indicator == 1) {
      route = "/tags"
    }
    else if (indicator == 2) {
      let usrPart = "/" + username;
      route = "categories/" + page.toString().replace(usrPart + "/", '') + "/tags";
    }
    else if (indicator == 4) {
      let productID = page.match(/(\d+)/)[0];
      route = "/products/" + productID + "/tags"
    }

    let info = await getInfo(route)
    let message = "The tags are " + info.tags.join(", ") + 
      " and... \nThat's all!"
    await updateMessages(message)
    agent.add("getting Tags")

  }
  // Cart (1 pt)
  async function queryCart() {
    let info = await getInfo('/application/products');
    let cart = info.products

    if (cart.length === 0 ){
      await updateMessages("Your cart is empty!");
      return;
    }

    let totalItems = 0
    let price = 0
    let categories = []
    for (let i = 0; i < cart.length; i++) {
      const item = cart[i];
      totalItems += item.count;
      price += item.price * item.count
      if (!categories.includes(item.category)) categories.push(item.category)
    }

    let message = "There are " + totalItems+" items in your cart, costing "+price+" dollars. " + "You have "+categories.join(", ")+" in your cart."
    await updateMessages(message);
    // Total items
    // Type of items
    // Total price
    // eg. There's 6 things in your cart. You've got 3 hats, a tee, and a legging. These all cost 120 dollars
  }
  // Product Info (1 pt)
  async function queryProduct() {
    let pID = await getProductId()
    let productRoute = '/products/' + pID
    let info = await getInfo(productRoute)
    let tags = await getInfo(productRoute + '/tags')
    let reviews = await getInfo(productRoute + '/reviews')
    let message = ""
    // Name
    message = message.concat("The " + info.name + " is " + info.price + " dollars. ")
    // Category
    message = message.concat("It is categorized in " + info.category + ". ")
    // Tags
    if (tags.tags){
      message = message.concat("It has the qualities " + tags.tags.join(",") +". ")
    } else {
      message = message.concat("This item doesn't have any tags associated with it. ")
    }
    if (reviews.reviews) {
      let avgScore = 0
      for (let i = 0; i < reviews.reviews.length; i++) {
        const element = reviews.reviews[i];
        avgScore += element.stars
      }
      avgScore = avgScore/reviews.reviews.length
      message = message.concat("It has " + reviews.reviews.length +" reviews with an average score of " + avgScore + ".")
    } else {
      message = message.concat("There are no reviews.")
    }

    await updateMessages(message)
  }
  // ACTIONS
  // Tags (1 pt)
  async function filter () {
    await clearTags()

    for (let i = 0; i < agent.parameters.Tags.length; i++) {
      const element = agent.parameters.Tags[i];
      let request = {
        method: 'POST',
        headers: {'Content-Type': 'application/json',
            "x-access-token": token},
        redirect: 'follow'
      }
      await fetch('https://mysqlcs639.cs.wisc.edu/application/tags/' 
        + element.toLowerCase(), request)
    }    
    let pgI = await pageIndicator()
    if(pgI != 2){
      await updateMessages("I'm currently filtering by tags. I can only show you a " +
      "list of products on a specific category page. Should I navigate to one?")
    } else (
      await updateMessages("Ok. I'm filtering by " + agent.parameters.Tags)
    )
    agent.add("Filtering")
  }

  async function stopFilter(){
    await clearTags()
    await updateMessages("I am no longer filtering by tags")
    agent.add("I'm not filtering any tags")
  }

  async function clearTags() {
    let request = {
      method: 'DELETE',
      headers: {'Content-Type': 'application/json',
          "x-access-token": token},
      redirect: 'follow'
    }
    await fetch('https://mysqlcs639.cs.wisc.edu/application/tags', request)
    agent.add("Clearing tags")
  }
  // Cart (1 pt)
  async function getProductId(){
    let uri = ""
    let pID = -1
    let indicator = await pageIndicator()
    if (indicator == 4){
      let page = await getInfo('/application')
      pID = page.page.match(/(\d+)/)[0];
    }
    else if(indicator == 2){
      let tagPart = ""
      // Are tags active
      let tags = await getInfo('/application/tags')
      if (tags.tags.length !== 0) {
        tagPart = "tags=" + tags.tags.toString()+ "&"
      }
      // What category
      let page = await getInfo('application')
      let categoryPart = "category="+page.page.replace("/"+username+"/", "").toLowerCase();
      
      uri = "/products/?" + tagPart+categoryPart
      let items = await getInfo(uri)
      // What position
      let ordinal = agent.parameters.ordinal
      pID = items.products[ordinal-1].id
    }
    agent.add("Getting the product")
    return pID
  }

  // You can't add an item to the cart if you're on its page, i guess
  async function addItemToCart() {
    let pID = await getProductId();
    // How many
    let number = agent.parameters.number || 1;
    let route = 'https://mysqlcs639.cs.wisc.edu/application/products/' + pID
    let request = {
      method: 'POST',
      headers: {'Content-Type': 'application/json',
          "x-access-token": token},
      redirect: 'follow'
    }

    for (let i = 0; i < number; i++) {
      await fetch(route, request)
    }

    agent.add("Adding to cart")
    await updateMessagesWithList(confirmPhrases);
  }

  async function removeItemFromCart() {

    let cart = await getInfo('/application/products')
    let pID = cart.products[agent.parameters.ordinal - 1].id
    let number = agent.parameters.number || cart.products.length
    let route = 'https://mysqlcs639.cs.wisc.edu/application/products/' + pID
    let request = {
      method: 'DELETE',
      headers: {'Content-Type': 'application/json',
          "x-access-token": token},
      redirect: 'follow'
    }

    for (let i = 0; i < number; i++) {
      await fetch(route, request)
    }

    agent.add("Removing from cart")
  }

  async function clearCart() {
    let request = {
      method: 'DELETE',
      headers: {'Content-Type': 'application/json',
          "x-access-token": token},
      redirect: 'follow'
    }
    await fetch(
      'https://mysqlcs639.cs.wisc.edu/application/products', request)    

    await updateMessages("Alright. Your cart is now empty.")
    agent.add("Clearing cart")
  }
  // Cart Confirm (1 pt)
  async function reviewCart() {
    let userPart = "/" + username;
    let uri = userPart + "/cart-review";

    setPage(uri);
    await updateMessages("Here is your cart.")
    agent.add("Getting cart info")
  }
  function confirmCart() { // OPTIONAL
    // Look at follow up intents
    // Ask on piazza if by confirming they just 
    // mean setting the page to the confirmed screen
  }
  // NAVIGATION (1pt)
  async function goToPage() {
    let categoryName = "";
    let productID = -1;

    let userPart = "/" + username;
    let categoryPart = "/" + categoryName;

    let pages = {
      "Welcome" : "/", 
      "Sign Up" : "/signUp", 
      "Sign In" : "/signIn", 
      "Home" : userPart,
      // "Category" : userPart + categoryPart, //Individual intent
      // "Product" : userPart + categoryPart + "/" + productID,
      "Cart" : userPart + "/cart",
      "Review" : userPart + "/cart-review", // modify cart only
      "Confirm" : userPart + "/cart-confirmed" // modify cart only
    }
    let selection = pages[agent.parameters.Pages]

    await setPage(selection)
    let msgs = ["Is this the page you're looking for?",
    "I think I've got this for you."];
    await updateMessagesWithList(msgs.concat(confirmPhrases));
    agent.add("Finding the page")
  }
  async function goToProductPage(){
    // What category
    let page = await getInfo('application')
    let categoryName = page.page.replace("/"+username+"/", "");
    let pID = -1    
    if (categoryName.includes("cart")) {
      let cart = await getInfo('/application/products')
      pID = cart.products[agent.parameters.ordinal - 1].id
      categoryName = cart.products[agent.parameters.ordinal - 1].category
    } else {
      pID = await getProductId();
    }
    

    let userPart = "/" + username;
    let categoryPart = "/" + categoryName

    setPage(userPart + categoryPart + "/products/" + pID)
    await updateMessagesWithList(confirmPhrases);
    agent.add("Getting item")
  }
  async function chooseCategory(){   
    let userPart = "/" + username;
    let categoryPart = "/" + agent.parameters.Categories.toLowerCase();

    setPage(userPart + categoryPart)

    await updateMessagesWithList(confirmPhrases);
    agent.add("Getting category")
  }
  async function goBack() {
    let request = {
      method: 'PUT',
      headers: {'Content-Type': 'application/json',
          "x-access-token": token},
      redirect: 'follow',
      body: JSON.stringify({back: true})
    }
    await fetch(
      'https://mysqlcs639.cs.wisc.edu/application', request)    

    await updateMessagesWithList(confirmPhrases);
    agent.add("Returning")
  }
  // UnhandledPromiseRejectionWarning
  async function setPage(uri) {
    let request = {
      method: 'PUT',
      headers: {'Content-Type': 'application/json',
          "x-access-token": token},
      redirect: 'follow',
      body: JSON.stringify({page: uri})
    }
    serverReturn = await fetch(
      'https://mysqlcs639.cs.wisc.edu/application', request)
    agent.add("Setting the page")
  }
  // MESSAGES (0.5 pts)
  async function updateMessages(message, isUser) {
    agent.add(message)
    let _message = {
      "date": new Date(),
      "isUser": isUser,
      "text": message,
    }

    let request = {
      method: 'POST',
      headers: {'Content-Type': 'application/json',
          "x-access-token": token},
      redirect: 'follow',
      body: JSON.stringify(_message)
    }   
    
    await fetch(
      'https://mysqlcs639.cs.wisc.edu/application/messages', request)
      .catch(error => console.error(error))
  }

  async function updateMessagesWithList(list) {
    let message = list[Math.floor(Math.random()*list.length)]
    await updateMessages(message, false)
  }
  async function clearMessages() {
    let request = {
      method: 'DELETE',
      headers: {'Content-Type': 'application/json',
          "x-access-token": token},
      redirect: 'follow'
    }
    await fetch(
      'https://mysqlcs639.cs.wisc.edu/application/messages', request)
    
  }

  
  
  let intentMap = new Map()  
  intentMap.set('Add Item To Cart', addItemToCart)
  intentMap.set('Choose Category', chooseCategory)
  intentMap.set('Clear Cart', clearCart)
  intentMap.set('Default Welcome Intent', welcome)
  intentMap.set('Filter', filter)
  intentMap.set('Filter - cancel', stopFilter)
  intentMap.set('Go Back', goBack)
  intentMap.set('Go To Page', goToPage)
  intentMap.set('Go To Product Page', goToProductPage)
  intentMap.set('Login', login) 
  intentMap.set('Query Cart', queryCart)
  intentMap.set('Query Categories', queryCategories)
  intentMap.set('Query Product', queryProduct)
  intentMap.set('Query Tags', queryTags)
  intentMap.set('Remove Item From Cart', removeItemFromCart)
  intentMap.set('Review Cart', reviewCart)
  intentMap.set('Review Cart - yes', confirmCart)
  intentMap.set('Review Cart - no', goBack)
  agent.handleRequest(intentMap)
})

app.listen(process.env.PORT || 8080)
