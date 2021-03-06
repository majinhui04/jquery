module.exports = function( Release ) {

	var
		fs = require( "fs" ),
		shell = require( "shelljs" ),

		// Windows needs the .cmd version but will find the non-.cmd
		// On Windows, ensure the HOME environment variable is set
		gruntCmd = process.platform === "win32" ? "grunt.cmd" : "grunt",

		devFile = "dist/jquery.js",
		minFile = "dist/jquery.min.js",
		mapFile = "dist/jquery.min.map",

		cdnFolder = "dist/cdn",

		releaseFiles = {
			"jquery-VER.js": devFile,
			"jquery-VER.min.js": minFile,
			"jquery-VER.min.map": mapFile //,
// Disable these until 2.0 defeats 1.9 as the ONE TRUE JQUERY
			// "jquery.js": devFile,
			// "jquery.min.js": minFile,
			// "jquery.min.map": mapFile,
			// "jquery-latest.js": devFile,
			// "jquery-latest.min.js": minFile,
			// "jquery-latest.min.map": mapFile
		},

		googleFilesCDN = [
			"jquery.js", "jquery.min.js", "jquery.min.map"
		],

		msFilesCDN = [
			"jquery-VER.js", "jquery-VER.min.js", "jquery-VER.min.map"
		],

		_complete = Release.complete;

	/**
	 * Generates copies for the CDNs
	 */
	function makeReleaseCopies() {
		shell.mkdir( "-p", cdnFolder );

		Object.keys( releaseFiles ).forEach(function( key ) {
			var text,
				builtFile = releaseFiles[ key ],
				unpathedFile = key.replace( /VER/g, Release.newVersion ),
				releaseFile = cdnFolder + "/" + unpathedFile;

			// Beta releases don't update the jquery-latest etc. copies
			if ( !Release.preRelease || key.indexOf( "VER" ) >= 0 ) {

				if ( /\.map$/.test( releaseFile ) ) {
					// Map files need to reference the new uncompressed name;
					// assume that all files reside in the same directory.
					// "file":"jquery.min.js","sources":["jquery.js"]
					text = fs.readFileSync( builtFile, "utf8" )
						.replace( /"file":"([^"]+)","sources":\["([^"]+)"\]/,
							"\"file\":\"" + unpathedFile.replace( /\.min\.map/, ".min.js" ) +
							"\",\"sources\":[\"" + unpathedFile.replace( /\.min\.map/, ".js" ) + "\"]" );
					fs.writeFileSync( releaseFile, text );
				} else if ( /\.min\.js$/.test( releaseFile ) ) {
					// Remove the source map comment; it causes way too many problems.
					// Keep the map file in case DevTools allow manual association.
					text = fs.readFileSync( builtFile, "utf8" )
						.replace( /\/\/# sourceMappingURL=\S+/, "" );
					fs.writeFileSync( releaseFile, text );
				} else if ( builtFile !== releaseFile ) {
					shell.cp( "-f", builtFile, releaseFile );
				}
			}
		});
	}

	function buildGoogleCDN( next ) {
		makeArchive( "googlecdn", googleFilesCDN, next );
	}

	function buildMicrosoftCDN( next ) {
		makeArchive( "mscdn", msFilesCDN, next );
	}

	function makeArchive( cdn, files, next ) {
		if ( Release.preRelease ) {
			console.log( "Skipping archive creation for " + cdn + "; this is a beta release." );
			return;
		}

		console.log( "Creating production archive for " + cdn );

		var archiver = require( "archiver" ),
			md5file = cdnFolder + "/" + cdn + "-md5.txt",
			output = fs.createWriteStream( cdnFolder + "/" + cdn + "-jquery-" + Release.newVersion + ".zip" );

		output.on( "error", function( err ) {
			throw err;
		});

		output.on( "close", next );
		archiver.pipe( output );

		files = files.map(function( item ) {
			return cdnFolder + "/" + item.replace( /VER/g, Release.newVersion );
		});

		shell.exec( "md5sum", files, function( code, stdout ) {
			fs.writeFileSync( md5file, stdout );
			files.push( md5file );

			files.forEach(function( file ) {
				archiver.append( fs.createReadStream( file ), { name: file } );
			});

			archiver.finalize();
		});
	}

	Release.define({
		npmPublish: true,
		issueTracker: "trac",
		contributorReportId: 508,
		/**
		 * Generates any release artifacts that should be included in the release.
		 * The callback must be invoked with an array of files that should be
		 * committed before creating the tag.
		 * @param {Function} callback
		 */
		generateArtifacts: function( callback ) {
			if ( Release.exec( gruntCmd ).code !== 0 ) {
				Release.abort("Grunt command failed");
			}
			makeReleaseCopies();
			callback([ "dist/jquery.js", "dist/jquery.min.js", "dist/jquery.min.map" ]);
		},
		/**
		 * Release completion
		 */
		complete: function() {
			// Build CDN archives
			Release._walk([ buildGoogleCDN, buildMicrosoftCDN, _complete ]);
		},
		/**
		 * Our trac milestones are different than the new version
		 * @example
		 *
		 * // For Release.newVersion equal to 2.1.0 or 1.11.0
		 * Release._tracMilestone();
		 * // => 1.11/2.1
		 *
		 * // For Release.newVersion equal to 2.1.1 or 1.11.1
		 * Release._tracMilestone();
		 * // => 1.11.1/2.1.1
		 */
		tracMilestone: function() {
			var otherVersion,
				m = Release.newVersion.split( "." ),
				major = m[0] | 0,
				minor = m[1] | 0,
				patch = m[2] | 0 ? "." + m[2] : "",
				version = major + "." + minor + patch;
			if ( major === 1) {
				otherVersion = "2." + ( minor - 10 ) + patch;
				return version + "/" + otherVersion;
			}
			otherVersion = "1." + ( minor + 10 ) + patch;
			return otherVersion + "/" + version;
		}
	});
};
