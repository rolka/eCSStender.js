/*------------------------------------------------------------------------------
Function:      eCSStender()
Author:        Aaron Gustafson (aaron at easy-designs dot net)
Creation Date: 2006-12-03
Version:       1.2.3
Homepage:      http://eCSStender.org
License:       MIT License (see homepage)
------------------------------------------------------------------------------*/

(function(){
  
  var

  // common references
  UNDEFINED,
  TRUE     = true,
  FALSE    = false,
  NULL     = null,
  STRING   = 'string',
  NUMBER   = 'number',
  ARRAY    = Array,
  FUNCTION = Function,
  REGEXP   = RegExp,
  DOCUMENT = document,
  WINDOW   = window,
  LOCATION = WINDOW.location.href,
  EMPTY_FN = function(){},
  
  // Common Strings
  ECSSTENDER  = 'eCSStender',
  EXTENSION   = 'extension',
  SELECTOR    = 'selector',
  PROPERTY    = 'property',
  SPECIFICITY = 'specificity',
  ALL         = 'all',
  MEDIA       = 'media',
  FIND_BY     = 'find_by',
  TEST        = 'test',
  LOOKUP      = 'lookup',
  FRAGMENT    = 'fragment',
  PREFIX      = 'prefix',
  PROPERTIES  = 'properties',
  CALLBACK    = 'callback',
  FILTER      = 'filter',
  PROCESSED   = 'processed',
  FINGERPRINT = 'fingerprint',
  PIPES       = '||||',
  EMPTY       = '',
  SPACE       = ' ',
  STAR        = '*',
  SLASH       = '/',
  COLON       = ':',
  SEMICOLON   = ';',
  HYPHEN      = '-',
  OPEN_CURLY  = '{',
  CLOSE_CURLY = '}',
  DIV         = 'div',
  HIDDEN      = 'hidden',
  TYPE        = 'type',
  COMPLETE    = 'complete',
  
  // Regex Bits
  ANYTHING        = '.*?',
  HYPHEN_ANYTHING = '-.*',
  CAPTURE         = '$1',
  
  // placeholders
  PH_ATMEDIA = '!' + ECSSTENDER + '-media-placeholder!',
  
  // internals
  __eCSStensions  = {},    // eCSStensions for parsing
  __e_count       = 0,     // count of registered extensions
  __t_count       = 0,     // count of triggered extensions
  __stylesheets   = [],    // stylesheets to parse
  __s             = 0,     // index of current stylesheet
  __style_objects = {},    // style rules to track
  __media_groups  = {},
  __xhr           = NULL,
  __initialized   = FALSE,
  __ignored_css   = [],
  __ignored_props = [ SELECTOR, SPECIFICITY ],
  __location      = LOCATION.replace( /^\w+:\/\/\/?(.*?)\/.*/, CAPTURE ),
  __local         = ( LOCATION.indexOf( 'http' ) !== 0 ),
  __delayed       = {},    // delayed stylesheets to write
  __on_complete   = [],
  
  // expando handling (for IE)
  __expando     = DOCUMENT.expando,
  toggleExpando = EMPTY_FN,
  
  // for embedding stylesheets
  __head         = FALSE,
  __style        = newElement( 'style' ),
  __embedded_css = [],
  addRules       = EMPTY_FN,
  
  // caching
  COUNT         = '-count',
  __modified    = {},
  __no_cache    = FALSE,
  __cached_out  = FALSE,
  __local_cache = {
    xhr:       {},
    extension: {},
    selector:  {},
    property:  {}
  },
  __headers = {},
  __cache_object,
  readFromBrowserCache = EMPTY_FN,
  writeToBrowserCache  = EMPTY_FN,
  clearBrowserCache    = EMPTY_FN,
  
  // other stuff
  __script = newElement( 'script' ),
  
  // useful RegExps
  // for breaking on commas
  REGEXP_COMMA  = /\s*,\s*/,
  // for getting file names
  REGEXP_FILE   = /.*\/(.*?\..*?)(?:\?.*)?$/,
  // for determining if it's a fully-executed path
  REGEXP_URL    = /\w+?\:\/\//,
  // for finding @font-face, @page & @media
  REGEXP_FONTS  = /@font-face\s*?\{(.*?)\s*?\}/ig,
  REGEXP_PAGES  = /@page\s*?(:\w*?){0,1}\{\s*?(.*?)\s*?\}/ig,
  REGEXP_MEDIA  = /@media\s*(.*?)\s*\{(.*?})\}/ig,
  // extended @ rules
  REGEXP_ATRULE = /@([\w-]+)(.*?)\{([^}]*)\}/ig,
  // for splitting properties from values
  REGEXP_P_V    = /:(?!\/\/)/,
  // for generating safe keys from selectors
  REGEXP_KEYS   = /[:()]/g,
  
  // eCSStender Object
  eCSStender = {
    name:      ECSSTENDER,
    version:   '1.2.3',
    fonts:     [],
    pages:     {},
    at:        {},
    methods:   {},
    cache:     FALSE,
    exec_time: 0
  };
  
  // window object
  WINDOW.eCSStender = eCSStender;
  
  /*------------------------------------*
   * Private Methods                    *
   *------------------------------------*/
  function initialize()
  {
    // keep us from going off more than 1x
    if ( __initialized ){ return; }
    __initialized = TRUE;
    // performance logging
    eCSStender.exec_time = now();
    // need the head
    __head = DOCUMENT.getElementsByTagName( 'head' )[0];
    // innards
    readBrowserCache();
    getActiveStylesheets();
    parseStyles();
  }
  function wrapUp()
  {
    validateCache();
    runTests();
    eCSStend();
    triggerCallbacks();
    writeBrowserCache();
    // performance logging
    eCSStender.exec_time = ( now() - eCSStender.exec_time ) * .001;
    triggerOnCompletes();
  }
  function getActiveStylesheets()
  {
    var
    stylesheets = DOCUMENT.styleSheets,
    s = 0, sLen = stylesheets.length;
    for ( ; s<sLen; s++ )
    {
      // add the stylesheet
      addStyleSheet( stylesheets[s] );
    }
    // if browsers don't expose cssText, we need to rely on XHR
    if ( sLen > 0 &&
         ! defined( stylesheets[0].cssText ) )
    {
      __xhr = TRUE;
    }
  }
  function parseStyles()
  {
    var s=0, sLen=__stylesheets.length, media, m, mLen;
    for ( ; s<sLen; s++ )
    {
      // determine the media type
      media = determineMedia( __stylesheets[s] );
      createMediaContainers( media );
      determinePath( __stylesheets[s] );
    }
    getCSSFiles();
  }
  function validateCache()
  {
    if ( __no_cache || __local ){ return; }
    // check the xhr headers against what we read from the cache
    var key, cached = __local_cache.xhr, i=j=0;
    eCSStender.cache = TRUE;
    for ( key in __modified )
    {
      i++;
      if ( ! isInheritedProperty( __modified, key ) &&
           __modified[key] != NULL )
      {
        j++;
        if ( ! defined( cached[key] ) ||
             cached[key] != __modified[key] )
        {
          eCSStender.cache = FALSE;
        }
        // update the cache
        __local_cache.xhr[key] = __modified[key];
      }
    }
    if ( i>j || ( i === 0 && j === 0 ) ){ eCSStender.cache = FALSE; }
  }
  function runTests()
  {
    if ( eCSStender.cache ){ return; }
    var temp = {}, e, count=0, extension_test;
    for ( e in __eCSStensions )
    {
      if ( ! isInheritedProperty( __eCSStensions, e ) )
      {
        extension_test = __eCSStensions[e][TEST];
        // verify test (if any)
        if ( ! defined( extension_test ) ||
             ( is( extension_test, FUNCTION ) &&
               extension_test() ) )
        {
          // if no test or test is passed, push to the temp array
          temp[e] = __eCSStensions[e];
          count++;
        }
      }
    }
    // reset the __eCSStensions array
    __eCSStensions = temp;
    __e_count = count;
  }
  function eCSStend()
  {
    // see if there's anything to do
    if ( __e_count < 1 ){ return; }
    var
    medium, styles, sorted_styles, s, sLen, selector,
    eLoop, e, e_media, e_lookup, e_find_by,
    lookups, l, lLen, temp, t, lookup,
    property;
    // no cache
    if ( ! eCSStender.cache )
    {
      // parse by medium
      for ( medium in __style_objects )
      {
        // safety for users who are using Prototype or any code that extends Object
        if ( ! isInheritedProperty( __style_objects, medium ) )
        {
          // start the processing in earnest      
          styles = __style_objects[medium];
          sorted_styles = getSortedArray( styles );
          for ( s=0, sLen=sorted_styles.length; s<sLen; s++ )
          {
            selector = sorted_styles[s][SELECTOR];
            // loop the extensions
            eLoop:
            for ( e in __eCSStensions )
            {
              // safety for users who are using Prototype or any code that extends Object
              if ( ! isInheritedProperty( __eCSStensions, e ) )
              {
                e_media = __eCSStensions[e][MEDIA];
                // verify any media restrictions
                if ( defined( e_media ) &&
                     e_media != ALL )
                {
                  e_media = e_media.split(REGEXP_COMMA);
                  if ( medium != ALL &&
                       ! in_object( medium, e_media ) ){
                    continue;
                  }
                }
                e_find_by = __eCSStensions[e][FIND_BY];
                e_lookup  = __eCSStensions[e][LOOKUP];
                lLen = e_lookup.length;
                // eCSStension is triggered by a selector 
                if ( e_find_by == SELECTOR )
                {
                  for ( l=0; l<lLen; l++ )
                  {
                    if ( selectorMatches( selector, e_lookup[l] ) )
                    {
                      trackCallback( e, medium, selector );
                      continue eLoop;
                    }
                  }
                }
                // eCSStension uses a property
                else if ( e_find_by == PROPERTY )
                {
                  for ( l=0; l<lLen; l++ )
                  {
                    if ( defined( styles[selector][e_lookup[l]] ) )
                    {
                      trackCallback( e, medium, selector );
                      continue eLoop;
                    }
                  }
                }
                // eCSStension uses a fragment or prefix
                else if ( e_find_by == FRAGMENT ||
                          e_find_by == PREFIX )
                {
                  lookup = ( e_find_by == FRAGMENT ) ? ANYTHING + e_lookup + ANYTHING
                                                     : HYPHEN + e_lookup + HYPHEN_ANYTHING;
                  lookup = newRegExp( lookup );
                  for ( property in styles[selector] )
                  {
                    if ( ! isInheritedProperty( styles, selector ) && // fix for tainted Object
                         ! in_object( property, __ignored_props ) &&
                         property.match( lookup ) )
                    {
                      trackCallback( e, medium, selector );
                      continue eLoop;
                    }
                  }
                } // end if eCSStension uses a fragment or prefix
              }  // end extended object test
            } // end eCSStensions loop
          } // end styles loop
        } // end extended object test
      } // end medium loop
    } // end if no cache
  }
  // log callbacks
  function trackCallback( fingerprint, medium, selector )
  {
    var selector_id = medium + PIPES + selector;
    writeToLocalCache( EXTENSION, EXTENSION + ( __t_count++ ), fingerprint + PIPES + selector_id, FALSE );
  }
  // callback functionality
  function triggerCallbacks()
  {
    var s = 0, e, extension, style_rule, selector_id, properties, specificity, oLen;
    for ( ; s<__t_count; s++ )
    {
      e = __local_cache[EXTENSION][EXTENSION+s].split(PIPES);
      extension   = __eCSStensions[e[0]];
      if ( defined( __style_objects[e[1]] ) )
      {
        style_rule  = __style_objects[e[1]][e[2]];
        selector_id = e[1] + PIPES + e[2];
        if ( ! defined( extension ) ||
             ! defined( style_rule ) ||
             in_object( selector_id, extension[PROCESSED] ) ||
             // apply any filters
             ( defined( extension[FILTER] ) &&
               ! filtersMatched( style_rule, extension[FILTER] ) ) ) { continue; }
        specificity = ( ! eCSStender.cache ) ? style_rule[SPECIFICITY]
                                             : getSpecificity( e[2] );
        properties = extractProperties( e[1], e[2], extension[PROPERTIES] );
        extension[CALLBACK]( e[2], properties, e[1], specificity );
        extension[PROCESSED].push( selector_id );
      }
    }
  }
  function triggerOnCompletes()
  {
    for ( var o = __on_complete.length-1; o >= 0; o-- )
    {
      __on_complete[o]();
    }
  }

  /*------------------------------------*
   * Private Utils                      *
   *------------------------------------*/
  function findImportedStylesheets( stylesheet )
  {
    // W3C
    if ( ! defined( stylesheet.imports ) )
    {
      findImportedStylesheets = function( stylesheet ){
        var
        blocks = stylesheet.cssRules || stylesheet.rules,
        i = 0, iLen;
        // for a strange Chrome error
        if ( blocks === NULL ){ return; }
        for ( iLen = blocks.length; i<iLen; i++ )
        {
          // imports must come first, so when we don't find one, return
          if ( blocks[i].type != 3 ){ return; }

          // add the stylesheet
          addStyleSheet( blocks[i].styleSheet );
        }
        // no need to XHR stylesheets that only import other stylesheets
        if ( i === iLen &&
             stylesheet.href )
        {
          __ignored_css.push( stylesheet.href.replace( REGEXP_FILE, CAPTURE ) );
        }
      };
    }
    // IE (old)
    else
    {
      findImportedStylesheets = function( stylesheet ){
        var imports = stylesheet.imports,
        i = 0, iLen = imports.length;
        for ( ; i<iLen; i++ )
        {
          // add the stylesheet
          addStyleSheet( imports[i] );
        }
      };
    }
    findImportedStylesheets( stylesheet );
  }
  function addStyleSheet( stylesheet )
  {
    var href = stylesheet.href;
    // skip if disabled
    if ( stylesheet.disabled ||
         ( href &&
             // or foreign
           ( determinePath( stylesheet ).indexOf( __location ) == -1 ||
             // or ignored
             in_object( href.replace( REGEXP_FILE, CAPTURE ), __ignored_css ) ) ) ){ return; }
    // does it have imports?
    findImportedStylesheets( stylesheet );
    // push the current stylesheet to the collection
    __stylesheets.push( stylesheet );
  }
  function getSortedArray( styles )
  {
    var arr = [], temp, selector;
    for ( selector in styles )
    {
      // fix for tainated Object
      if ( ! isInheritedProperty( styles, selector ) )
      {
        // continue
        temp = styles[selector];
        temp[SELECTOR]    = selector;
        temp[SPECIFICITY] = getSpecificity( selector );
        arr.push( temp );
      }
    }
    arr.sort( sortBySpecificity );
    return arr;
  }
  function sortBySpecificity( a, b )
  {
    var x = a[SPECIFICITY], y = b[SPECIFICITY];
    return ( ( x < y ) ? -1 : ( ( x > y ) ? 1 : 0 ) );
  }
  function getSpecificity( selector )
  {
    var s = 0, matches;
    // replace all child and adjascent sibling selectors
    selector = selector.replace( /\s*\+\s*|\s*\>\s*/, SPACE );
    // adjust :not() to simplify calculations (since it counts toward specificity, as do its contents)
    selector = selector.replace( /(:not)\((.*)\)/, '$1 $2' );
    // match id selectors (weight: 100)
    matches = selector.match( /#/ );
    if ( matches != NULL ) s += ( matches.length * 100 );
    selector = selector.replace( /#[\w-_]+/, EMPTY ); // remove (to keep the regexs simple)
    // match class, pseudo-class, and attribute selectors (weight: 10)
    matches = selector.match( /::|:|\.|\[.*?\]/ );
    if ( matches != NULL ) s += ( matches.length * 10 );
    selector = selector.replace( /(?:::|:|\.)[\w-_()]+|\[.*?\]/, EMPTY ); // remove
    // match element selectors (weight: 1) - they should be all that's left
    matches = trim( selector ) != EMPTY ? selector.split( SPACE ) : [];
    s += matches.length;
    return s;
  }
  function determinePath( stylesheet )
  {
    var
    actual_path = stylesheet.actual_path,
    css_path    = actual_path || stylesheet.href,
    parent      = stylesheet.parentStyleSheet,
    curr_path, path_last_slash, file_name,
    parent_path = prefix = EMPTY;
    if ( ! css_path ) { css_path = NULL; }
    // we only want sheets
    if ( ! actual_path &&
         ( parent != NULL ||                         // with a parent or
           ( css_path != NULL &&                     // that has a path and
             css_path.match( REGEXP_URL ) === NULL ) ) ) // isn't a full URL
    {
      if ( css_path.indexOf( SLASH ) === 0 ) { css_path = css_path.substring( 1 ); }
      curr_path       = LOCATION.substring( 0, LOCATION.lastIndexOf( SLASH ) );
      path_last_slash = css_path.lastIndexOf( SLASH );
      file_name       = css_path.substring( path_last_slash + 1 );
      // check for an owner
      if ( parent == NULL )
      {
        if ( defined( stylesheet.ownerNode ) &&
             defined( CSSImportRule ) &&
             is( stylesheet.ownerRule, CSSImportRule ) )
        {
          parent = stylesheet.ownerRule.parentStyleSheet;
        }
      }
      // still no parent, use the css path itself
      if ( parent == NULL )
      {
        prefix = curr_path + SLASH + css_path.substring( 0, path_last_slash );
      }
      // get the owner's path
      else
      {
        parent_path = determinePath( parent );
        prefix      = parent_path.substring( 0, parent_path.lastIndexOf( SLASH ) );
      }
      css_path = prefix + SLASH + file_name;
    }
    stylesheet.actual_path = css_path;
    return css_path;
  }
  function determineMedia( stylesheet )
  {
    var media = stylesheet.media;
    // W3C compliant
    if ( ! is( media, STRING ) )
    {
      determineMedia = function( stylesheet ){
        var
        media = stylesheet.media,
        owner = stylesheet.ownerRule,
        mediaText = FALSE;
        if ( ! is( media, STRING ) )
        {
          // imported
          if ( owner != NULL )
          {
            // media assignment in the import
            mediaText = owner.media.mediaText;
            if ( ! mediaText )
            {
              // no media assignment... inherit
              mediaText = determineMedia( owner.parentStyleSheet );
            }
          }
          // media is defined
          else
          {
            mediaText = media.mediaText;
          }
        }
        // default = all
        stylesheet.actual_media = mediaText ? mediaText : ALL;
        if ( is( stylesheet.actual_media, STRING ) )
        {
          stylesheet.actual_media = stylesheet.actual_media.split( REGEXP_COMMA );
        }
        return stylesheet.actual_media;
      };
    }
    // old school
    else
    {
      determineMedia = function( stylesheet ){
        var mediaText = stylesheet.media;
        // default = all
        stylesheet.actual_media = mediaText ? mediaText : ALL;
        if ( is( stylesheet.actual_media, STRING ) )
        {
          stylesheet.actual_media = stylesheet.actual_media.split( REGEXP_COMMA );
        }
        return stylesheet.actual_media;
      };
    }
    return determineMedia( stylesheet );
  }
  function extractAtBlocks( css )
  {
    // extract @font-face
    css = extractFonts( css );
    // extract @page
    css = extractPages( css );
    // handle @media
    css = handleMediaGroups( css );
    // extract other @ rules
    css = extractOtherAtRules( css );
    // return the string
    return css;
  }
  function extractFonts( css )
  {
    var match;
    while ( ( match = REGEXP_FONTS.exec( css ) ) != NULL )
    {
      eCSStender.fonts.push( gatherProperties( match[1] ) );
    }
    return css.replace( REGEXP_FONTS, EMPTY );
  }
  function extractPages( css )
  {
    var match, page, props;
    while ( ( match = REGEXP_PAGES.exec( css ) ) != NULL )
    {
      page = ( defined( match[1] ) &&
               match[1] != EMPTY ) ? match[1].replace( COLON, EMPTY )
                                   : ALL;
      props = gatherProperties( match[2] );
      if ( ! defined( eCSStender.pages[page] ) )
      {
        eCSStender.pages[page] = props;
      }
      else
      {
        for ( prop in props )
        {
          if ( ! isInheritedProperty( props, prop ) )
          {
            eCSStender.pages[page][prop] = props[prop];
          }
        }
      }
      
    }
    return css.replace( REGEXP_PAGES, EMPTY );
  }
  function handleMediaGroups( css )
  {
    var match, media, m, mLen, styles, id = 0;
    while ( ( match = REGEXP_MEDIA.exec( css ) ) != NULL )
    {
      css = collapseAtMedia( css, match, id );
      id++;
    }
    return css;
  }
  function extractOtherAtRules( css )
  {
    var match, group, keys, k, props, prop;
    while ( ( match = REGEXP_ATRULE.exec( css ) ) != NULL )
    {
      group = match[1];
      keys  = trim( match[2] );
      keys  = ( keys == EMPTY ) ? FALSE : keys.split( REGEXP_COMMA );
      props = gatherProperties( match[3] );
      if ( ! defined( eCSStender.at[group] ) )
      {
        eCSStender.at[group] = ! keys ? addPush( [] ) : {};
      }
      if ( ! keys )
      {
        eCSStender.at[group].push( props );
      }
      else
      {
        k = keys.length-1;
        while ( k > -1 )
        {
          if ( ! defined( eCSStender.at[group][keys[k]] ) )
          {
            eCSStender.at[group][keys[k]] = props;
          }
          else
          {
            for ( prop in props )
            {
              if ( ! isInheritedProperty( props, prop ) )
              {
                eCSStender.at[group][keys[k]][prop] = props[prop];
              }
            }
          }
          k--;
        }
      }
    }
    return css.replace( REGEXP_ATRULE, EMPTY );
  }
  function collapseAtMedia( css, match, id )
  {
    media  = match[1].split(REGEXP_COMMA);
    styles = match[2];
    createMediaContainers( media );
    __media_groups[id] = {
      media: media,
      styles: styles
    };
    return css.replace( match[0], PH_ATMEDIA + '{id:' + id + CLOSE_CURLY );
  }
  function expandAtMedia( id )
  {
    var media_group = __media_groups[id];
    extractStyleBlocks( media_group.media, media_group.styles );
    __media_groups[id] = NULL;
  }
  function extractStyleBlocks( media, css )
  {
    // parse it into blocks & remove the last item (which is empty)
    var blocks = css.split(CLOSE_CURLY),
    b = 0, bLen, props, prop, selector, m, medium, arr, a, aLen;
    blocks.pop();
    // loop
    for ( bLen=blocks.length; b<bLen; b++ )
    {
      // separate the selector and the properties
      blocks[b] = blocks[b].split(OPEN_CURLY);
      // gather the properties
      props = gatherProperties( blocks[b][1] );
      // build the selectors (which are part of the master object)
      selector = blocks[b][0];
      
      // single selector
      if ( selector.indexOf( PH_ATMEDIA ) != -1 )
      {
        expandAtMedia( props.id );
      }
      else
      {
        arr = selector.split(REGEXP_COMMA);
        for ( a=0, aLen=arr.length; a<aLen; a++ )
        {
          selector = trim( arr[a] );
          for ( m in media )
          {
            if ( ! isInheritedProperty( media, m ) )
            {
              medium = media[m];
              if ( ! defined( __style_objects[medium][selector] ) )
              {
                __style_objects[medium][selector] = {};
              }
              for ( prop in props )
              {
                if ( ! isInheritedProperty( props, prop ) )
                {
                  __style_objects[medium][selector][prop] = props[prop];
                }
              }
            }
          }
        }
      }
    }
  }
  function gatherProperties( properties )
  {
    if ( ! is( properties, STRING ) ){ return {}; }
    properties = properties.split(SEMICOLON);
    var props = {}, p = 0, pLen = properties.length, arr, property;
    for ( ; p<pLen; p++ )
    {
      property = trim( properties[p] );
      // skip empties
      if ( property == EMPTY ){ continue; }
      arr = property.split(REGEXP_P_V);
      props[trim(arr[0])] = trim( arr[1] );
    }
    return props;
  }
  function determineProperties( lookup, requested_properties )
  {
    var properties = [], property, fragment, prefix, i, iLen;
    // properties is set
    if ( ! is_false( requested_properties ) )
    {
      // user doesn't want everything
      if ( requested_properties != STAR )
      {
        // gather requested properties
        if ( is( requested_properties, STRING ) )
        {
          properties.push( requested_properties );
        }
        else if ( is( requested_properties, ARRAY ) )
        {
          for ( i=0, iLen=requested_properties.length; i<iLen; i++ )
          {
            properties.push( requested_properties[i] );
          }
        }
      }
      else
      {
        properties = requested_properties;
      }
    }
    // now for the remainder
    if ( requested_properties != STAR )
    {
      // retrieve properties that were explicitly looked up
      property = lookup[PROPERTY];
      fragment = lookup[FRAGMENT];
      prefix   = lookup[PREFIX];
      if ( defined( property ) )
      {
        if ( is( property, STRING ) )
        {
          properties.push( property );
        }
        else if ( is( property, ARRAY ) )
        {
          for ( i=0, iLen=property.length; i<iLen; i++ )
          {
            properties.push( property[i] );
          }
        }
      }
      // retrieve fragment matches
      else if ( defined( fragment ) )
      {
        properties.push( newRegExp( ANYTHING + fragment + ANYTHING ) );
      }
      // retrieve prefix matches
      else if ( defined( prefix ) )
      {
        properties.push( newRegExp( HYPHEN + prefix + HYPHEN_ANYTHING ) );
      }
    }
    return properties;
  }
  function extractProperties( medium, selector, requested_properties )
  {
    var requested_property, property, properties = {}, p = 0, pLen,
    style_rule = __style_objects[medium][selector];
    // grab the requested properties
    if ( is( requested_properties, ARRAY ) )
    {
      for ( pLen=requested_properties.length; p<pLen; p++ )
      {
        requested_property = requested_properties[p];
        if ( is( requested_property, REGEXP ) )
        {
          for ( property in style_rule )
          {
            if ( ! isInheritedProperty( style_rule, property ) && // fix for tainted Object
                 ! in_object( property, __ignored_props ) &&
                 property.match( requested_property ) != NULL )
            {
              properties[property] = style_rule[property];
            }
          }
        }
        else if ( is( requested_property, STRING ) &&
                  defined( style_rule[requested_property] ) )
        {
          properties[requested_property] = style_rule[requested_property];
        }
      }
    }
    // all properties (*)
    else
    {
      for ( property in style_rule )
      {
        if ( ! isInheritedProperty( style_rule, property ) &&
             ! in_object( property, __ignored_props ) )
        {
          properties[property] = style_rule[property];
        }
      }
    }
    return properties;
  }
  function arrayify( something )
  {
    var arr=[], i=0, iLen, temp, t, tLen;
    if ( ! is( something, ARRAY ) )
    {
      if ( is( something, STRING ) &&
           something.indexOf(',') != -1 )
      {
        temp = something.split( REGEXP_COMMA );
        for ( iLen=temp.length; i<iLen; i++ )
        {
          arr.push( temp[i] );
        }
      }
      else
      {
        arr = [ something ];
      }
    }
    else
    {
      for ( iLen=something.length; i<iLen; i++ )
      {
        if ( is( something[i], STRING ) &&
            something[i].indexOf(',') != -1 )
        {
          temp = something[i].split( REGEXP_COMMA );
          for ( t=0, tLen=temp.length; t<tLen; t++ )
          {
            arr.push( temp[t] );
          }
        }
        else
        {
          arr.push( something[i] );
        }
      }
    }
    return arr;
  }
  function createMediaContainers( media )
  {
    if ( ! is( media, ARRAY ) )
    {
      media = ( media + EMPTY ).split( REGEXP_COMMA );
    }
    for ( var m=0, mLen=media.length; m<mLen; m++ )
    {
      if ( ! defined( __style_objects[media[m]] ) )
      {
        __style_objects[media[m]] = {};
      }
    }
  }
  function selectorMatches( selector, test )
  {
    var useless = /\*(?!\s|>|\+)/g;
    return ( ( is( test, REGEXP ) &&
               selector.match( test ) != NULL ) ||
             ( is( test, FUNCTION ) &&
               test.call( selector ) === TRUE ) ||
             ( is( test, STRING ) &&
               selector.indexOf( trim( test.replace( useless, EMPTY ) ) ) != -1 ) );
  }
  function filtersMatched( properties, filters )
  {
    var count, required_count, prop, filter;
    for ( prop in properties )
    {
      if ( ! isInheritedProperty( properties, prop ) &&
           ! in_object( prop, __ignored_props ) )
      {
        count = required_count = 0;
        for ( filter in filters )
        {
          if ( ! isInheritedProperty( filters, filter ) )
          {
            required_count++;
            if ( filter == PROPERTY )
            {
              if ( prop.match( filters[filter] ) ){ count++; }
            }
            else if ( filter == 'value' )
            {
              if ( properties[prop].match( filters[filter] ) ){ count++; }
            }
          }
        }
      }
      if ( count == required_count ){ return TRUE; }
    }
    return FALSE;
  }
  function clean( css )
  {
    var
    low_function  = low,
    html_comments = /\s*(?:\<\!--|--\>)\s*/g, // strip HTML comments
    css_comments  = /\/\*(?:.|\s)*?\*\//g,    // strip CSS comments
    whitespace    = /\s*([,{}:;])\s*/g,       // remove returns and indenting whitespace
    at_imports    = /@import.*?;/g,           // axe imports
    // IE returns all uppercase tags and property names (except on XHR)
    lowercase     = /(?:\s?([^.#:]+).*?[,{]|\s?([^:]+):)/ig;
    return css.replace( html_comments, EMPTY ) 
              .replace( css_comments, EMPTY )    
              .replace( whitespace, CAPTURE )     
              .replace( at_imports, EMPTY )           
              .replace( lowercase, low_function );
  }
  function in_object( needle, haystack )
  {
    for ( var key in haystack )
    {
      if ( haystack[key] == needle ){ return TRUE; }
    }
    return FALSE;
  }
  function now()
  {
    return new Date().getTime();
  }
  function is( obj, test )
  {
    var r = FALSE;
    try
    {
      r = obj instanceof test;
    }
    catch ( e )
    {
      r = ( typeof( test ) == STRING &&
            typeof( obj ) == test );
    }
    return r;
  }
  function is_false( a )
  {
    return a === FALSE;
  }
  function defined( a )
  {
    return a != UNDEFINED;
  }
  function charAt( str )
  {
    return String.fromCharCode( str );
  }
  function getCSSFiles()
  {
    if ( __xhr )
    {
      getCSSFiles = function()
      {
        var stylesheet, file, css, status;
        if ( stylesheet = __stylesheets[__s] )
        {
          if ( file = stylesheet.actual_path )
          {
            if ( file === NULL ||
                 in_object( file.replace( REGEXP_FILE, CAPTURE ), __ignored_css ) )
            {
              getCSSFiles();
            }
            else
            {
              __xhr = new XHR();
              __xhr.onreadystatechange = xhrHandler;
              __xhr.open( 'GET', file, FALSE );
              __xhr.send( NULL );
              try {
                if ( __xhr.onreadystatechange != xhrHandler )
                {
                  __xhr.onreadystatechange = xhrHandler();
                }
              } catch ( e ) { }
            }
          }
          else
          {
            readCSS( extract( stylesheet ), stylesheet.actual_media );
            __s++;
            getCSSFiles();
          }
        }
        else
        {
          wrapUp();
        }
      };
      getCSSFiles();
    }
    else
    {
      for ( var i=0, iLen=__stylesheets; i<iLen; i++ )
      {
        if ( ! in_object( __stylesheets[i].actual_path.replace( REGEXP_FILE, CAPTURE ), __ignored_css ) ) 
        {
          readCSS( __stylesheets[i].cssText, __stylesheets[i].actual_media );
        }
      }
    }
  }
  function xhrHandler( e )
  {
    if ( __xhr.readyState == 4 )
    {
      status = __xhr.status;
      if ( status == 0 ||                       // local
           ( status >= 200 && status < 300 ) || // good
           status == 304 )                      // cached
      {
        readCSS( __xhr.responseText, __stylesheets[__s].actual_media );
        __modified[fingerprint( __stylesheets[__s].actual_path )] = __xhr.getResponseHeader('Last-Modified');
      }
      __s++;
      getCSSFiles();
    }
  }
  function readCSS( css, media )
  {
    css  = clean( css );
    css  = extractAtBlocks( css );
    // handle remaining rules
    extractStyleBlocks( media, css );
  }
  function extract( stylesheet )
  {
    var r;
    if ( defined( stylesheet.cssText ) )
    {
      extract = function( stylesheet )
      {
        return stylesheet.ownerNode.innerHTML;
      };
      r = extract();
    }
    else
    {
      try {
        r = stylesheet.ownerNode.innerHTML;
        extract = function( stylesheet )
        {
          return stylesheet.ownerNode.innerHTML;
        };
      }
      catch ( e )
      {
        r = stylesheet.owningElement.innerHTML;
        extract = function( stylesheet )
        {
          return stylesheet.owningElement.innerHTML;
        };
      }
    }
    return r;
  }
  function low( w )
  {
    return is( w, STRING ) ? w.toLowerCase() : w;
  }
  function camelize( str )
  {
    var
    bits = str.split(HYPHEN), len  = bits.length, new_str, i = 1;
    if ( len == 1 ) { return bits[0]; } 
    if ( str.charAt(0) == HYPHEN ) {
      new_str = bits[0].charAt(0).toUpperCase() + bits[0].substring(1);
    } else {
      new_str = bits[0];
    }
    while ( i < len ) {
      new_str += bits[i].charAt(0).toUpperCase() + bits[i].substring(1);
      i++;
    }
    return new_str;
  }
  function zero_out( str )
  {
    if ( is( str, STRING ) )
    {
      str = str.replace( /(\s0)px/g, CAPTURE );
    }
    return str;
  }
  function addInlineStyle( el, property, value )
  {
    try {
      el.style[property] = value;
      el.style[camelize( property )] = value;
    } catch( e ){
      return FALSE;
    }
    return TRUE;
  }
  function XHR()
  {
    var connection;
    try { connection = new XMLHttpRequest(); }
    catch( e ){
      try { connection = new ActiveXObject('Msxml2.XMLHTTP'); }
      catch( e ){
        try { connection = new ActiveXObject('Microsoft.XMLHTTP'); }
        catch( e ){
          connection = FALSE;
        }
      }
    }
    return ( ! connection ) ? NULL : connection;
  }
  function newElement( el )
  {
    return DOCUMENT.createElement( el );
  }
  function newRegExp( rxp )
  {
    return new RegExp( rxp );
  }
  // push handling
  function addPush( arr )
  {
    return arr;
  }
  if ( Array.prototype.push == NULL )
  {
    var push = function( obj )
    {
      this[this.length] = obj;
      return this.length;
    };
    eCSStender.fonts.push = __eCSStensions.push = __stylesheets.push = __embedded_css.push = __on_complete.push = push;
    addPush = function( arr )
    {
      if ( typeof( arr ) == ARRAY )
      {
        arr.push = push;
      }
      return arr;
    };
  }
  // expando handling
  if ( defined( __expando ) )
  {
    toggleExpando = function()
    {
      if ( ! defined( DOCUMENT.old_expando ) ||
           DOCUMENT.old_expando == NULL )
      {
        DOCUMENT.old_expando = DOCUMENT.expando;
        DOCUMENT.expando = FALSE;
      }
      else
      {
        DOCUMENT.expando = DOCUMENT.old_expando;
        DOCUMENT.old_expando = NULL;
      }
    };
  }
  
  /*-------------------------------------*
   * Delayed Writing
   *-------------------------------------*/
  function writeStyleSheets()
  {
    var id, style;
    for ( id in __delayed )
    {
      if ( ! isInheritedProperty( __delayed, id ) )
      {
        style = DOCUMENT.getElementById( id );
        addRules( style, __delayed[id] );
        // style.disabled = FALSE;
      }
    }
  }
  __on_complete.push( writeStyleSheets );
  
  /*-------------------------------------*
   * Caching
   *-------------------------------------*/
  function enableCache()
  {
    // HTML5 and/or Mozilla
    if ( defined( WINDOW.localStorage ) )
    {
      __cache_object = WINDOW.localStorage;
      clearBrowserCache = function()
      {
        __cache_object.clear();
      };
      readFromBrowserCache = function( cache, key )
      {
        return __cache_object.getItem( cache + HYPHEN + key );
      };
      writeToBrowserCache = function( cache, key, value )
      {
        __cache_object.setItem( cache + HYPHEN + key, value );
      };
    }
    // IE (old school)
    else
    {
      var
      div = newElement(DIV),
      tomorrow = new Date();
      div.style.behavior = 'url(#default#userData)';
      DOCUMENT.body.appendChild(div);
      if ( defined( div.XMLDocument ) )
      {
        __cache_object = div;
        __cache_object.load( ECSSTENDER );
        // set the expiration for 1 week
        tomorrow.setMinutes( tomorrow.getMinutes() + 10080 );
        tomorrow = tomorrow.toUTCString();
        __cache_object.expires = tomorrow;
        clearBrowserCache = function()
        {
          __cache_object.XMLDocument.childNodes[0].attributes.length = 0;
        };
        readFromBrowserCache = function( cache, key )
        {
          return __cache_object.getAttribute( cache + HYPHEN + key );
        };
        writeToBrowserCache = function( cache, key, value )
        {
          __cache_object.setAttribute( cache + HYPHEN + key, value );
          __cache_object.save( ECSSTENDER );
        };
      }
    }
  }
  function readBrowserCache()
  {
    if ( __no_cache || __local ){ return; }
    enableCache();
    var cache_group, item, count;
    for ( cache_group in __local_cache )
    {
      if ( ! isInheritedProperty( __local_cache, cache_group ) &&
           defined( cache_group ) )
      {
        count = readFromBrowserCache( ECSSTENDER, cache_group + COUNT );
        if ( defined( count ) )
        {
          if ( cache_group == EXTENSION )
          {
            __t_count = count;
            if ( count < 1 ){ eCSStender.cache = FALSE; }
          }
          while ( count >= 0 )
          {
            item = readFromBrowserCache( cache_group, count );
            if ( item != NULL )
            {
              if ( cache_group == EXTENSION )
              {
                __local_cache[cache_group][EXTENSION+count] = item;
              }
              else
              {
                item = item.split(PIPES);
                if ( item[1] == 'true' ){ item[1] = TRUE; }
                if ( item[1] == 'false' ){ item[1] = FALSE; }
                __local_cache[cache_group][item[0]] = item[1];
              }
            }
            count--;
          }
        }
      }
    }
  }
  function writeBrowserCache()
  {
    if ( __no_cache || __local ){ return; }
    var cache_group, key, count, extension;
    for ( cache_group in __local_cache )
    {
      if ( ! isInheritedProperty( __local_cache, cache_group ) &&
           defined( cache_group ) )
      {
        count = 0;
        for ( key in __local_cache[cache_group] )
        {
          if ( ! isInheritedProperty( __local_cache[cache_group], key ) &&
               defined( cache_group ) )
          {
            if ( cache_group == EXTENSION )
            {
              extension = __local_cache[cache_group][key];
              extension[PROCESSED] = [];
              writeToBrowserCache( cache_group, count, extension );
            }
            else 
            {
              writeToBrowserCache( cache_group, count, key + PIPES + __local_cache[cache_group][key] );
            }
            count++;
          }
        }
        writeToBrowserCache( ECSSTENDER, cache_group + COUNT, count );
      }
    }
    __cached_out = TRUE;
  }
  function styleObjToString( obj )
  {
    var str = EMPTY, key;
    for ( key in obj )
    {
      if ( ! isInheritedProperty( obj, key ) )
      {
        str += key + COLON + obj[key] + SEMICOLON;
      }
    }
    return str;
  }
  function stringToStyleObj( str )
  {
    var matches, obj = FALSE;
    if ( ( matches = str.exec( /^\{(.*?)\}$/ ) ) != NULL )
    {
      obj = gatherProperties( matches[1] );
    }
    return obj;
  }
  function fingerprint( str )
  {
    // UTF8 encode
    str = str.replace(/\r\n/g,'\n');
    var 
    keystr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    i, iLen = str.length, newstr = EMPTY, c1, c2, c3, e1, e2, e3, e4;
    for ( i=0; i<iLen; i++ )
    {
      c1 = str.charCodeAt(i);
      if ( c1 < 128 )
      {
    		newstr += charAt( c1 );
    	}
    	else if ( (c1 > 127) && (c1 < 2048) )
    	{
    		newstr += charAt( (c1 >> 6) | 192 );
    		newstr += charAt( (c1 & 63) | 128 );
    	}
    	else
    	{
    		newstr += charAt( (c1 >> 12) | 224 );
    		newstr += charAt( ((c1 >> 6) & 63) | 128 );
    		newstr += charAt( (c1 & 63) | 128 );
    	}
		}
		str = newstr;
		newstr = EMPTY;
		// base64
		i = 0;
		iLen = str.length;
    while ( i < iLen )
    {
      c1 = str.charCodeAt(i++);
      c2 = str.charCodeAt(i++);
      c3 = str.charCodeAt(i++);
       
      e1 = c1 >> 2;
      e2 = ((c1 & 3) << 4) | (c2 >> 4);
      e3 = ((c2 & 15) << 2) | (c3 >> 6);
      e4 = c3 & 63;

      if ( isNaN(c2) )
      {
      	e3 = e4 = 64;
      }
      else if ( isNaN(c3) )
      {
      	e4 = 64;
      }
      newstr += keystr.charAt(e1) + keystr.charAt(e2) +
                keystr.charAt(e3) + keystr.charAt(e4);
    }
    return newstr;
  }
  function writeToLocalCache( group, key, value, encode )
  {
    encode = ! defined( encode ) ? TRUE : encode;
    if ( ! is_false( encode ) ){
      key = fingerprint(key);
    }
    __local_cache[group][key] = value;
    if ( __cached_out )
    {
      writeToBrowserCache( group, key, value );
    }
  }
  function readFromLocalCache( group, key, encode )
  {
    encode = ! defined( encode ) ? TRUE : encode;
    if ( ! is_false( encode ) ){
      key = fingerprint(key);
    }
    var value = __local_cache[group][key];
    return ! defined( value ) ? UNDEFINED : value;
  }

  /*-------------------------------------*
   * Public Methods                      *
   *-------------------------------------*/
  /**
   * eCSStender::register()
   * registers an extension
   *
   * @param obj keys - define the lookup; supports the following properties:
   *  * Mutually exclusive lookup methods:
   *    * 'fragment' (str) - a portion of the property to look up
   *    * 'prefix' (str) - to lookup by vendor-specific prefix
   *    * 'property' (mixed)
   *      * to lookup by property, use a string
   *      * to lookup by multiple, use an array of strings
   *    * 'selector' (mixed) - to find by selector; accepts
   *      * compound selectors in a string, separated by commas
   *      * a RegExp to match
   *      * an array of selector strings or RegExp objects to match
   *  * 'filter' (obj) - allows you to filter the lookup results by property name or value
   *    * 'property' (mixed) - string or regex to match for the extension to apply
   *    * 'value' (mixed) - string or regex to match for the extension to apply
   *  * 'media' (str) - restricts the media to which you want to
   *    restrict the extension
   *  * 'test' (fn) - a test function to run that will determine 
   *     whether or not the extension should run; should return 
   *     TRUE if the extension SHOULD run, FALSE if it SHOULD NOT.
   *  * 'fingerprint' (str) - a unique ID for the extension (not required)
   * @param mixed properties - the properties you want back; supports for:
   *  * FALSE - returns only the looked-up property or properties with 
   *    the given fragment or prefix
   *  * '*' (str) - returns all properties of the selected elements
   *  * single property (str) - returns the supplied property
   *  * multiple properties (arr) - returns the requested properties
   * @param fn callback - the function to be called when the extension 
   *                      finds a subject
   */
  eCSStender.register = function( keys, properties, callback )
  {
    var eCSStension = {}, lookups, l, temp, t, props=[], key, id=EMPTY;
    // set the lookup type
    if ( defined( keys[SELECTOR] ) )
    {
      eCSStension[FIND_BY] = SELECTOR;
      eCSStension[LOOKUP]  = keys[SELECTOR];
    }
    else if ( defined( keys[PROPERTY] ) )
    {
      eCSStension[FIND_BY] = PROPERTY;
      eCSStension[LOOKUP]  = keys[PROPERTY];
    }
    else if ( defined( keys[FRAGMENT] ) )
    {
      eCSStension[FIND_BY] = FRAGMENT;
      eCSStension[LOOKUP]  = keys[FRAGMENT];
    }
    else if ( defined( keys[PREFIX] ) )
    {
      eCSStension[FIND_BY] = PREFIX;
      eCSStension[LOOKUP]  = keys[PREFIX];
    }
  
    // convert some lookups to arrays to simplify things later on
    if ( eCSStension[FIND_BY] == SELECTOR ||
         eCSStension[FIND_BY] == PROPERTY )
    {
      eCSStension[LOOKUP] = arrayify( eCSStension[LOOKUP] );
    }

    // filter?
    if ( defined( keys[FILTER] ) )
    {
      eCSStension[FILTER] = keys[FILTER];
    }
  
    // media restriction?
    if ( defined( keys[MEDIA] ) )
    {
      eCSStension[MEDIA] = keys[MEDIA];
    }
  
    // test first?
    if ( defined( keys[TEST] ) )
    {
      eCSStension[TEST] = keys[TEST];
    }
  
    // set the properties to capture
    eCSStension[PROPERTIES] = determineProperties( keys, properties );
    
    // create the fingerprint
    if ( ! defined( keys[FINGERPRINT] ) )
    {
      for ( key in eCSStension )
      {
        if ( ! isInheritedProperty( eCSStension, key ) )
        {
          id += key + COLON + eCSStension[key].toString() + SEMICOLON;
        }
      }
      id = fingerprint(id+'::'+__e_count);
    }
    else
    {
      id = keys[FINGERPRINT];
    }

    // set the callback
    eCSStension[CALLBACK] = callback;
    // create the processed array
    eCSStension[PROCESSED] = [];
    // save the extension
    __eCSStensions[id] = eCSStension;
    __e_count++;
  };

  /**
   * eCSStender::lookup()
   * looks up and returns styles based on the supplied info
   *
   * @param obj lookup - define the lookup; supports the following properties:
   *  * Mutually exclusive lookup methods:
   *    * FRAGMENT (str) - a portion of the property to look up
   *    * PREFIX (str) - to lookup by vendor-specific prefix
   *    * PROPERTY (mixed)
   *      * to lookup by property, use a string
   *      * to lookup by multiple, use an array of strings
   *    * SELECTOR (mixed) - to find by selector; accepts
   *      * compound selectors in a string, separated by commas
   *      * a RegExp to match
   *      * an array of selector strings or RegExp objects to match
   *      * a function that returns TRUE for a positive match
   *  * MEDIA (str) - restricts the media within which you want to search
   *  * SPECIFICITY (mixed) - the desired specificity parameters
   *    * if an integer, implies maximum specificity
   *    * if an object, use keys to set the thresholds:
   *      * 'max' (int) - maximum specificity to match
   *      * 'min' (int) - minimum specificity to match
   * @param mixed properties - the properties you want back; support for:
   *  * FALSE - returns only the looked-up property or properties with 
   *    the given fragment or prefix
   *  * '*' (str) - returns all properties of the selected elements
   *  * single property (str) - returns the supplied property
   *  * multiple properties (arr) - returns the requested properties
   * 
   * @return arr of style objects, each with the following keys:
   *  * 'medium'      - the medium of the match
   *  * PROPERTIES  - the properties requested
   *  * SELECTOR    - the selector matched
   *  * SPECIFICITY - the specificity of the selector
   */
  eCSStender.lookup = function( lookup, properties )
  {
    var
    l_specificity = lookup[SPECIFICITY],
    l_selector    = lookup[SELECTOR],
    l_property    = lookup[PROPERTY],
    l_fragment    = lookup[FRAGMENT],
    l_prefix      = lookup[PREFIX],
    l_media       = lookup[MEDIA],
    min, max,
    medium, e_media,
    sLoop, styles, sorted_styles,
    s, sLen, selector, found,
    i, iLen, test, matches = [];
    // figure out specificity params
    if ( defined( l_specificity ) )
    {
      if ( is( l_specificity, NUMBER ) )
      {
        max = l_specificity;
        min = 0;
      }
      else if ( is( l_specificity, 'object' ) )
      {
        max = l_specificity['max'];
        min = l_specificity['min'];
      }
    }
    // make the selector setup consistent
    if ( defined( l_selector ) )
    {
      l_selector = arrayify( l_selector );
    }
    else if ( defined( l_property ) )
    {
      l_property = arrayify( l_property );
    }
    // figure out properties to return
    props = determineProperties( lookup, properties );
    // loop
    for ( medium in __style_objects )
    {
      // safety for users who are using Prototype or any code that extends Object
      if ( ! isInheritedProperty( __style_objects, medium ) )
      {
        // verify any media restrictions
        if ( defined( l_media ) &&
             l_media != ALL )
        {
          e_media = l_media.split(REGEXP_COMMA);
          if ( medium != ALL &&
               ! in_object( medium, e_media ) )
          {
            continue;
          }
        }
        // start the processing in earnest      
        styles        = __style_objects[medium];
        sorted_styles = getSortedArray( styles );
        sLoop:
        for ( s=0, sLen=sorted_styles.length; s<sLen; s++ )
        {
          // check the selector
          selector = sorted_styles[s][SELECTOR];
          block    = styles[selector];
          if ( defined( l_selector ) )
          {
            found = FALSE;
            for ( i=0, iLen=l_selector.length; i<iLen; i++ )
            {
              if ( selectorMatches( selector, l_selector[i] ) )
              {
                found = TRUE;
                break;
              }
            }
            if ( is_false( found ) )
            {
              continue;
            }
          }
          // check properties
          else if ( defined( l_property ) )
          {
            found = FALSE;
            for ( i=0, iLen=l_property.length; i<iLen; i++ )
            {
              if ( defined( block[l_property[i]] ) )
              {
                found = TRUE;
                break;
              }
            }
            if ( is_false( found ) )
            {
              continue;
            }
          }
          // check fragments, and/or prefixes
          else if ( defined( l_fragment ) ||
                    defined( l_prefix ) )
          {
            found = FALSE;
            test = ( defined( l_fragment ) ) ? ANYTHING + l_fragment + ANYTHING
                                             : HYPHEN + l_prefix + HYPHEN_ANYTHING;
            test = newRegExp( test );
            for ( property in block )
            {
              if ( ! isInheritedProperty( styles, selector ) && // fix for tainted Object
                   ! in_object( property, __ignored_props ) &&
                   property.match( test ) )
              {
                found = TRUE;
                break;
              }
            }
            if ( is_false( found ) )
            {
              continue;
            }
          }
          // check the specificity
          if ( defined( l_specificity ) )
          {
            if ( block[SPECIFICITY] < min ||
                 block[SPECIFICITY] > max )
            {
              continue;
            }
          }
          // if you made it this far, you passed the tests
          matches.push({
            medium:      medium,
            properties:  extractProperties( medium, selector, props ),
            selector:    selector,
            specificity: block[SPECIFICITY]
          });
        } // end styles loop
      }
    } // end medium loop
    
    // back what we found
    return matches;

  };

  /**
   * eCSStender::addMethod()
   * sets a custom JavaScript method in eCSStender's methods object
   *
   * @param str name - a name for the method
   * @param func the_function - the function to store
   */
  eCSStender.addMethod = function( name, the_function )
  {
    if ( ! defined( eCSStender.methods[name] ) )
    {
      eCSStender.methods[name] = the_function;
    }
  };

  /**
   * eCSStender::onComplete()
   * adds a function to be called on completion of eCSStender's run
   *
   * @param func the_function - the function to store
   */
  eCSStender.onComplete = function( the_function )
  {
    __on_complete.push( the_function );
  };

  /**
   * eCSStender::embedCSS()
   * embeds styles to the appropriate media
   *
   * @param str styles - the styles to embed
   * @param str media  - the media to apply the stylesheet to (optional)
   * @param bool delay - whether or not to delay the writing of the stylesheet (default = true)
   * 
   * @return obj - the STYLE element
   */
  eCSStender.embedCSS = function( styles, media, delay )
  {
    // determine the medium
    media = media || ALL;
    // determine whether to delay the write or not
    delay = defined( delay ) ? delay : TRUE;
    // determine the id
    var id = 'eCSStension-' + media, style;
    // find or create the embedded stylesheet
    if ( ! in_object( media, __embedded_css ) )
    {
      // make the new style element
      style = newStyleElement( media, id, delay );
      // store the medium
      __embedded_css.push( media );
    }
    else
    {
      style = DOCUMENT.getElementById( id );
    }
    // add the rules to the sheet
    if ( style != NULL )
    {
      if ( ! delay )
      {
        addRules( style, styles );
      }
      else
      {
        __delayed[id] += styles;
      }
    }
    // return the style element
    return style;
  };

  /**
   * eCSStender::newStyleElement()
   * adds a new stylesheet to the document
   *
   * @param str media  - the media to apply the stylesheet to
   * @param str id     - the id to give the stylesheet (optional)
   * @param bool delay - whether or not to delay the writing of the stylesheet (default = true)
   * 
   * @return obj - the STYLE element
   */
  function newStyleElement( media, id, delay )
  {
    // clone the model style element
    var style = __style.cloneNode( TRUE );
    // set the media type & id
    media = media || ALL;
    style.setAttribute( MEDIA, media );
    id = id || 'temp-' + Math.round( Math.random() * 2 + 1 );
    style.setAttribute( 'id', id );
    // determine whether to delay the write or not
    delay = defined( delay ) ? delay : TRUE;
    if ( delay )
    {
      __delayed[id] = EMPTY;
      //style.disabled = TRUE;
    }
    __head.appendChild( style );
    // return the element reference
    return style;
  }
  eCSStender.newStyleElement = newStyleElement;

  /**
   * eCSStender::addRules()
   * adds rules to a specific stylesheet
   *
   * @param obj el     - the stylesheet
   * @param str styles - the style rules to add
   */
  __style.setAttribute( TYPE, 'text/css' );
  if ( defined( __style.styleSheet ) )
  { 
    addRules = function( el, styles )
    {
      el.styleSheet.cssText += styles;
    };
  }
  else
  {
    addRules = function( el, styles )
    { 
      el.appendChild( DOCUMENT.createTextNode( styles ) ); 
    };
  }
  eCSStender.addRules = addRules;

  /**
   * eCSStender::isSupported()
   * tests support for properties and selectors
   *
   * @param str type - PROPERTY or SELECTOR
   * @param str what - the property:value pair or the selector in question
   * @param obj html - the HTML to test against (used by selector test)
   * @param obj el   - the element the selector should select (used by selector test)
   * 
   * @return bool - TRUE for success, FALSE for failure
   */
  eCSStender.isSupported = function( type, what, html, el )
  {
    var result,
    body = DOCUMENT.body,
    // property test vars
    property, value, settable = TRUE,
    compute = WINDOW.getComputedStyle,
    // selector test vars
    style;
    if ( defined( result = readFromLocalCache( type, what ) ) )
    {
      return result;
    }
    else
    {
      result = FALSE;
      if ( type == PROPERTY )
      {
        // test element
        el = newElement(DIV);
        body.appendChild( el );
        what = what.split(REGEXP_P_V);
        property  = what[0];
        value     = trim( what[1] );
        what = what.join(COLON);
        toggleExpando();
        if ( ! addInlineStyle( el, property, value ) )
        {
          settable = FALSE;
        }
        toggleExpando();
        if ( settable &&
             ( el.currentStyle &&
               zero_out( el.currentStyle[camelize( property )] ) == value ) ||
             ( compute &&
               zero_out( compute( el, NULL ).getPropertyValue( property ) ) == value ) )
        {
          result = TRUE;
        }
        // cleanup
        body.removeChild( el );
        el = NULL;
      }
      else if ( type == SELECTOR )
      {
        // append the test markup and the test style element
        body.appendChild( html );
        style = newStyleElement( 'screen', FALSE, FALSE );
        // if the browser doesn't support the selector, it should error out
        try {
          addRules( style, what + " { visibility: hidden; }" );
          // if it succeeds, we don't want to run the eCSStension
          if ( ( el.currentStyle &&
                 el.currentStyle['visibility'] == HIDDEN ) ||
               ( compute &&
                 compute( el, NULL ).getPropertyValue( 'visibility' ) == HIDDEN ) )
          {
            result = TRUE;
          }
        } catch( e ){}
        // cleanup
        body.removeChild( html );
        style.parentNode.removeChild( style );
        style = NULL;
      }
      writeToLocalCache( type, what, result );
      return result;
    }
  };

  /**
   * eCSStender::applyWeightedStyle()
   * apply a weighted inline style (based on specificity)
   *
   * @param obj el - the element to apply the property to
   * @param obj properties - a hash of the properties to assign
   * @param int specificity - the specificity of the selector
   */
  eCSStender.applyWeightedStyle = function( el, properties, specificity )
  {
    if ( ! defined( el.inlineStyles ) )
    {
      el.inlineStyles = {};
    }
    var prop, styles = el.inlineStyles;
    for ( prop in properties )
    {
      if ( ! isInheritedProperty( properties, prop ) &&
           ( ! defined( styles[prop] ) ||
             styles[prop] <= specificity ) )
      {
        addInlineStyle( el, prop, properties[prop] );
        el.inlineStyles[prop] = specificity;
      }
    }
  };

  /**
   * eCSStender::ignore()
   * tells eCSStendet to ignore a file or files
   *
   * @param mixed sheets - a string or array of stylesheet paths to ignore
   */
  eCSStender.ignore = function( sheets )
  {
    if ( is( sheets, STRING ) )
    {
      sheets = [ sheets ];
    }
    else if ( ! is( sheets, ARRAY ) )
    {
      return;
    }
    for ( var i=0, iLen=sheets.length; i<iLen; i++ )
    {
      __ignored_css.push( sheets[i] );
    }
  };

  /**
   * eCSStender::disableCache()
   * tells eCSStender not to cache or work from the cache
   */
  eCSStender.disableCache = function()
  {
    __no_cache = TRUE;
  };

  /**
   * eCSStender::trim()
   * trims a string
   *
   * @param str str - the string to trim
   * 
   * @return str - the trimmed string
   */
  function trim( str )
  {
    if ( is( str, STRING ) )
    {
      return str.replace( /^\s+|\s+$/g, EMPTY );
    }
    return str;
  }
  eCSStender.trim = trim;

  /**
   * eCSStender::loadScript()
   * dynamically loads a JavaScript file without loading the same one twice
   *
   * @param str src - the path to the JavaScript
   * @param fn callback - optional callback to run when script is loaded
   */
  __script.setAttribute( TYPE, 'text/javascript' );
  eCSStender.loadScript = function( src, callback )
  {
    var
    scripts  = DOCUMENT.getElementsByTagName('script'),
    i        = scripts.length,
    script   = __script.cloneNode( TRUE );
    callback = callback || EMPTY_FN;
    while ( i-- )
    {
      if ( scripts[i].src == src )
      {
        script = FALSE;
      }
    }
    if ( script )
    {
      script.onreadystatechange = function(){
        if ( script.readyState == 'loaded' ||
             script.readyState == COMPLETE )
        {
          script.onreadystatechange = NULL;
          callback();
        } 
      };
      script.setAttribute( 'src', src );
      __head.appendChild( script );
    }
    else
    {
      setTimeout( callback, 100 );
    }
  };

  /**
   * eCSStender::isInheritedProperty()
   * tests whether the given property is inherited
   *
   * @param obj obj - the object to test
   * @param str prop - the property to look for
   * 
   * @return bool - TRUE is property is inherited, FALSE is it isn't
   */
  function isInheritedProperty( obj, prop )
  {
    if ( obj.hasOwnProperty )
    {
      isInheritedProperty = function( obj, prop )
      {
        return ! obj.hasOwnProperty(prop);
      };
    }
    else
    {
      isInheritedProperty = function( obj, prop )
      {
        var c = obj.constructor;
        if ( c &&
             c.prototype )
        { 
          return obj[prop] === c.prototype[prop];
        } 
        return TRUE;
      };
    }
    eCSStender.isInheritedProperty = isInheritedProperty;
    return isInheritedProperty( obj, prop );
  }

  /*-------------------------------------*
   * DOM Loaded Trigger                  *
   * Based on jQuery's                   *
   *-------------------------------------*/
  (function(){
    var
    DCL = 'DOMContentLoaded',
    ORC = 'onreadystatechange',
    __old_onload = WINDOW.onload,
    doScroll = DOCUMENT.documentElement.doScroll;
    
    // for Mozilla/Safari/Opera9
  	if ( DOCUMENT.addEventListener )
    {
      DOCUMENT.addEventListener( DCL, function(){
        DOCUMENT.removeEventListener( DCL, arguments.callee, FALSE );
        initialize();
      }, FALSE );
    }
    // If IE event model is used
  	else if ( DOCUMENT.attachEvent )
  	{
  		// ensure firing before onload, maybe late but safe also for iframes
  		DOCUMENT.attachEvent( ORC, function(){
  			if ( DOCUMENT.readyState === COMPLETE ) {
  				DOCUMENT.detachEvent( ORC, arguments.callee );
  				initialize();
  			}
  		});

  		// If IE and not an iframe, continually check to see if the document is ready
  		if ( doScroll &&
  		     WINDOW == WINDOW.top )
  		{
  		  (function(){
  			  try {
      			// If IE is used, use the trick by Diego Perini
      			// http://javascript.nwbox.com/IEContentLoaded/
      			doScroll('left');
      		}
      		catch( error )
      		{
      			setTimeout( arguments.callee, 0 );
      			return;
      		}
          // and execute any waiting functions
  			  initialize();
  		  })();
  	  }
  	}
  })();
  
})();