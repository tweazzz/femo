const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new", // Use new headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Capture console logs from the browser
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  try {
    console.log('1. Navigating to register.html...');
    await page.goto('http://127.0.0.1:3000/register.html', { waitUntil: 'networkidle0' });

    console.log('2. Filling initial registration form...');
    
    // Wait for the form to be ready
    await page.waitForSelector('form');

    // Fill Role (Participant)
    // Assuming the select has id="role" or name="role"
    await page.select('select[name="role"]', 'participant');

    // Fill Country
    await page.select('select[name="country"]', 'KZ'); // Assuming KZ is a valid option

    // Fill Email
    await page.type('input[name="email"]', 'testuser@example.com');

    // Fill Name
    await page.type('input[name="surname"]', 'TestSurname');
    await page.type('input[name="first_name"]', 'TestName');

    // Fill Password
    await page.type('input[name="password"]', 'Password123!');
    await page.type('input[name="password2"]', 'Password123!');

    console.log('3. Submitting form...');
    // Click submit
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
    ]);

    // Check if we are on participant/register.html
    const url = page.url();
    if (!url.includes('participant/register.html')) {
      throw new Error(`Failed to redirect. Current URL: ${url}`);
    }
    console.log('   Redirected to participant/register.html successfully.');

    console.log('4. Verifying Source selection step...');
    
    // Check if source radio buttons exist
    const radios = await page.$$('input[name="source"]');
    if (radios.length === 0) {
      throw new Error('No source radio buttons found!');
    }
    console.log(`   Found ${radios.length} source options.`);

    // Verify labels (optional, but good)
    const instagramOption = await page.$('input[value="instagram"]');
    if (!instagramOption) throw new Error('Instagram option not found');

    console.log('5. Testing validation (submit without source)...');
    
    // Fill other required fields to isolate source validation
    // City is an input, not select
    await page.waitForSelector('input[name="city"]', { visible: true });
    
    // Helper to fill input reliably
    const fillInput = async (selector, value) => {
        await page.$eval(selector, (el, val) => {
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }, value);
    };

    await fillInput('input[name="city"]', 'Almaty');
    const cityVal = await page.$eval('input[name="city"]', el => el.value);
    console.log(`   [DEBUG] City value after setting: "${cityVal}"`);
    
    await fillInput('input[name="school"]', 'Test School');
    await page.select('select[name="grade"]', '5');

    // study_language is radio buttons
    // Click the label or input for 'ru'
    // <input type="radio" name="study_language" value="ru" ...>
    // It might be hidden, so click the label or force click
    const langRadio = await page.$('input[name="study_language"][value="ru"]');
    if (langRadio) {
        await page.evaluate(el => el.click(), langRadio);
    } else {
        console.warn('Could not find study_language radio for ru');
    }

    // parent_name is name="full_name" in HTML
    await fillInput('input[name="full_name"]', 'Parent Name');
    await fillInput('input[name="parent_phone"]', '+77001112233');
    
    // teacher_name is name="teacher_full_name" in HTML
    await fillInput('input[name="teacher_full_name"]', 'Teacher Name');
    await fillInput('input[name="teacher_phone"]', '+77003334455');
    
    // Now submit without source
    await page.click('button[type="submit"]');
    
    // Wait a bit for JS to process
    await new Promise(r => setTimeout(r, 500));
    
    // Check if browser blocked submission due to required attribute
    const isSourceInvalid = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[name="source"]');
        return Array.from(inputs).some(i => !i.validity.valid);
    });

    if (isSourceInvalid) {
        console.log('   Validation verified: Browser blocked submission (required attribute active).');
    } else {
        // Fallback: check for custom error
        const errorText = await page.evaluate(() => {
            const el = document.querySelector('.error-text');
            return el && el.textContent ? el.textContent : null;
        });
        if (errorText && errorText.includes('Укажите откуда вы узнали о нас')) {
             console.log('   Validation verified: Got custom error.');
        } else {
             console.warn('   WARNING: Validation did not trigger as expected. Source might be considered valid?');
        }
    }

    console.log('6. Selecting source and submitting...');
    
    // Check sessionStorage
    const sessionData = await page.evaluate(() => sessionStorage.getItem('pending_registration'));
    const sessionPass = await page.evaluate(() => sessionStorage.getItem('pending_password'));
    console.log('   [DEBUG] sessionStorage.pending_registration:', sessionData ? 'FOUND' : 'MISSING');
    console.log('   [DEBUG] sessionStorage.pending_password:', sessionPass ? 'FOUND' : 'MISSING');

    // Select Other
    console.log('   Clicking "Other" radio button...');
    const otherInputRadio = await page.$('input[value="other"]');
    if (otherInputRadio) {
        await otherInputRadio.click();
        // Force change event to ensure listener fires
        await page.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })), otherInputRadio);
    } else {
        throw new Error('Other input radio not found');
    }

    // Wait for text input to appear
    console.log('   Waiting for #source_other_input to become visible...');
    try {
        await page.waitForSelector('#source_other_input', { visible: true, timeout: 5000 });
    } catch (e) {
        // Debug if timeout
        const html = await page.evaluate(() => document.querySelector('#source_other_container').outerHTML);
        console.log('   [DEBUG] Container HTML:', html);
        throw e;
    }
    
    // Fill custom source text
    await fillInput('#source_other_input', 'Custom Source Text');

    // Intercept network request to verify payload
    let payloadVerified = false;
    await page.setRequestInterception(true);
    
    page.on('request', request => {
      // console.log('   [REQ]', request.method(), request.url());
      if (request.url().includes('/api/users/participant/registration/') && request.method() === 'POST') {
        const postData = request.postData();
        const data = JSON.parse(postData);
        console.log('   Intercepted registration payload:', data);
        
        if (data.source === 'Custom Source Text') {
          console.log('   SUCCESS: Payload contains source="Custom Source Text"');
          payloadVerified = true;
        } else {
          console.error('   FAILURE: Payload incorrect source:', data.source);
        }
        request.abort(); // Block actual request
      } else {
        request.continue();
      }
    });

    // Submit
    const submitBtn = await page.$('button[type="submit"]');
    await page.evaluate(el => el.click(), submitBtn);

    // Wait for request interception
    try {
        await page.waitForResponse(response => 
            response.url().includes('/api/users/participant/registration/') && 
            response.status() === 200 || response.status() === 400 || response.status() === 500
        , { timeout: 5000 });
    } catch (e) {
        console.log('   [WARN] No response received within timeout');
    }
    
    // Check if any error appeared
    const finalError = await page.evaluate(() => {
        const el = document.querySelector('.error-text');
        return el && el.offsetParent !== null ? el.textContent : null;
    });
    if (finalError) {
        console.error('   [ERROR] Submission failed with message:', finalError);
    }

    if (!payloadVerified) {
        console.log('   [DEBUG] Payload verification failed. Checking console logs for payload...');
    } else {
        console.log('Test PASSED!');
    }
    
    // browser.close();

  } catch (error) {
    console.error('Test FAILED:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
