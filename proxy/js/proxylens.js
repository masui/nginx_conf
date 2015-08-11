/*
 * Return a Crypto-JS WordArray filled with securely random bits.
 */
function getSecureRandomWordArray(words) {
    var bytes = new Uint8Array(words * 4);
    window.crypto.getRandomValues(bytes);
    return CryptoJS.lib.WordArray.create(bytes);
}

/*
 * Get the address of a new rendezvous channel asynchronously.
 */
function getRendezvousChannel(onSuccess, onFailure, domain) {
    if (typeof onSuccess === "undefined") {
        onSuccess = function(channelUrl) {};
    }
    if (typeof onFailure === "undefined") {
        onFailure = function() {};
    }
    if (typeof domain === "undefined") {
        domain = "rendezvous.mypico.org";
    }

    var req = new XMLHttpRequest();
    req.open("get", "https://" + domain + "/new", true);
    req.onload = function() {
        if (this.status === 200) {
	    var channelUrl = "https://" + domain + "/" + this.responseText;
	    onSuccess(channelUrl);
	} else {
	    onFailure();
	}
    }
    req.onerror = onFailure();
    req.ontimeout = onFailure();
    console.log("Requesting new rendezvous channel from " + domain);
    req.send();      
}

/*
 * Write some data to a rendezvous channel asynchronously.
 */
function writeToRendezvousChannel(channelUrl, data, onSuccess, onFailure) {
    if (typeof onSuccess === "undefined") {
        onSuccess = function(channelUrl) {};
    }
    if (typeof onFailure === "undefined") {
        onFailure = function() {};
    }

    var req = new XMLHttpRequest();
    req.open("post", channelUrl, true);
    req.setRequestHeader("Content-Type", "application/octet-stream");
    req.onload = function() {
        if (this.status === 200) {
	    onSuccess();
	} else {
	    onFailure();
	}
    }
    req.onerror = onFailure();
    req.ontimeout = onFailure();
    console.log("Writing data to " + channelUrl);

    // COULD BE ENCODING RELATED PROBLEMS HERE - NOT SURE IF THE STRING WILL GET UTF-8'ed
    req.send(data);
}

/*
 * Form the proper JSON QR code contents from the necessary values.
 */
function makeQrContents(channelUrl, encKey, macKey) {
    return JSON.stringify({
	t: "PA",
        ta: channelUrl,
	ek: "AES/CBC/PKCS7Padding/" + CryptoJS.enc.Base64.stringify(encKey),
	mk: "HmacSHA256/" + CryptoJS.enc.Base64.stringify(macKey)
    });
}

/*
 * Return the absolute version a possibly-relative URL taken from the
 * current document.
 */
function qualifyUrl(url) {
    var element = document.createElement("span");
    element.innerHTML = '<a href="' + url + '">&nbsp;</a>';
    return element.firstChild.href;
}

/*
 * Return the action of a given form element.
 */
function getFormAction(form) {	
    if (form.getAttribute("action")) {
       	// Ensure that the form action is returned as a absolute URL.
	return qualifyUrl(form.getAttribute("action"));
    } else {
        return document.URL;
    }
}

/*
 * Return the commitment of a form action.
 * 
 * The commitment is a base64-encoded SHA256 hash of the action with the
 * querystring component removed.
 */
function commitFormAction(formAction) {
    var hash = CryptoJS.SHA256(formAction.split("?")[0]); // remove query
    return CryptoJS.enc.Base64.stringify(hash);
}

/*
 * Get form element "nearest" another element.
 *
 * If the given element is a form element, then it is returned. Otherwise
 * the first descendant of it that is a form element is returned.
 */
function getNearestForm(element) {
    if (element.tagName.toLowerCase() === "form") {
        return element;
    } else {
        return element.getElementsByTagName("form").item(0);
    }
}

/*
 * Return a "minified" version of a HTML string.
 */
function minifyHtml(html) {
    // Remove white space after newlines
    html = html.replace(/\n\s+/g, "\n");

    // Remove excess white space
    html = html.replace(/\s+/, " ");

    return html;
}

/*
 * Form the JSON data to be sent via the rendezvous point.
 *
 * The data sent via the rendezvous point is encrypted using the key encKey,
 * with initial vector iv and has a HMAC keyed by macKey. encKey and macKey
 * must be transmitted to the peer via a separate channel (QR code).
 */
function makeRvpData(serviceAddress, serviceCommitment, loginFormHtml, cookieString, encKey, iv, macKey) {
    // Form and encrypt the plaintext
    var plaintext = JSON.stringify({
        sa: serviceAddress,
	sc: serviceCommitment,
	lf: minifyHtml(loginFormHtml),
	cs: cookieString,
    });
    console.log(plaintext);
    var enc = CryptoJS.AES.encrypt(plaintext, encKey, { iv: iv });

    // Create the MAC (HMAC SHA256)
    var hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, macKey);
    hmac.update(iv);
    hmac.update(enc.ciphertext);
    var mac = hmac.finalize();

    // Form the total data to be sent via the RVP
    return JSON.stringify({
	iv: CryptoJS.enc.Base64.stringify(iv),
        ciphertext: CryptoJS.enc.Base64.stringify(enc.ciphertext),
	mac: CryptoJS.enc.Base64.stringify(mac)
    });
}

var qrDivId = "mainFormWrap";
var loginFormDivId = "mainFormWrap";

window.onload = function() {
    // Have to use 128-bit because of stupid Java Crypto policy thing
    var encKey = getSecureRandomWordArray(4);
    var iv = getSecureRandomWordArray(8);
    var macKey = getSecureRandomWordArray(8);

    // Login form stuff
    var loginForm = getNearestForm(document.getElementById(loginFormDivId));
    var loginFormHtml = loginForm.outerHTML;
    console.log(loginFormHtml);
    var loginFormAction = getFormAction(loginForm);
    console.log(loginFormAction);
    var loginFormActionCommit = commitFormAction(loginFormAction);
    console.log(loginFormActionCommit);
    var loginFormUrl = document.URL;
    console.log(loginFormUrl);

    // Cookies
    var cookieString = document.cookie;
    console.log(cookieString);

    // Data to send via RVP:
    var rvpData = makeRvpData(
	loginFormUrl,
	commitFormAction(loginFormAction),
	loginFormHtml,
	cookieString,
	encKey,
	iv,
	macKey
    );
    console.log(rvpData);

    getRendezvousChannel(function(channelUrl) {
        var qrContents = makeQrContents(channelUrl, encKey, macKey);
        new QRCode(document.getElementById(qrDivId), {
            text: qrContents,
	    correctLevel: QRCode.CorrectLevel.L
	});
	writeToRendezvousChannel(channelUrl, rvpData, function() {
	    // Wrote to rendezvous successfully (and read by Pico)
	    // TODO accept and decrypt response
	});
    });
}
