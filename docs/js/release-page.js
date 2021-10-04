let latestArtifactDropdown = doT.template(`<div class="col d-flex justify-content-center"><div class="dropdown"><button class="btn btn-primary btn-lg dropdown-toggle" type="button" id="dropdownMenuButton" data-mdb-toggle="dropdown" aria-expanded="false" {{? !it.assets.length }}disabled{{?}}><i class="{{= it.icon }}"></i>&nbsp{{= it.name }}</button><ul class="dropdown-menu" aria-labelledby="dropdownMenuButton">{{~ it.assets :a }}<li><a class="dropdown-item" href="{{=a.url}}">{{=a.displayName}}{{~ a.additionalTags :t }} - {{=t}}{{~}}</a></li>{{~}}</ul></div></div>`)

let releaseRow = doT.template(`
<div class="row release-row">
  <div class="row release-row-details">
    <div class="col-md-auto release-tag">{{= it.releaseName }}</div>
    <div class="col-md-auto flex-fill release-date">{{= it.releaseDate }}</div>
    <div class="col-md-auto d-flex justify-content-end release-artifacts">
    {{~ it.platforms :platform }}{{? platform.assets.length }}
      <a role="button" id="language-dropdown" data-mdb-toggle="dropdown" data-mdb-ripple-duration="none">
        <i class="{{= platform.icon }} release-artifact-icon"></i>
      </a>
      <ul class="dropdown-menu" id="language-dropdown-list">
      {{~ platform.assets :asset }}
        <li>
          <a class="dropdown-item" href="{{= asset.url }}">{{= asset.displayName }}{{~ asset.additionalTags :t }} - {{=t}}{{~}}</a>
        </li>
      {{~}}
      </ul>
    {{?}}
    {{~}}
    </div>
    <div class="col-md-auto d-flex justify-content-end align-items-center release-notes-toggle-container">
      <a role="button" class="release-notes-toggle">Release Notes</a>
    </div>
  </div>
  <div class="row release-notes mt-2">
    <div class="col-12">{{= it.releaseNotes }}</div>
  </div>
</div>`);

let pullRequestRow = doT.template(`
<div class="row release-row">
  <div class="row release-row-details">
    <div class="col-md-8 pr-title">{{= it.title }}</div>
    <div class="col-md-auto flex-fill pr-author">{{= it.authorName }}</div>
    <div class="col-md-auto d-flex align-items-center pr-additions-deletions">
      <i class="far fa-plus-square pr-additions"></i>&nbsp;
      <span class="pr-additions">{{= it.additions }}</span>
      <i class="far fa-minus-square pr-deletions"></i>&nbsp;
      <span class="pr-deletions">{{= it.deletions }}</span>
    </div>
    <div class="col-md-auto d-flex justify-content-end align-items-center">
      <a class="pr-link" href="{{= it.url }}">Github Link</a>
    </div>
  </div>
</div>`);

let emptyPreviousReleases = doT.template(`<div class="row"><div class="col release-no-previous-text"><h5>There are no previous releases to display</h5></div></div>`);

let viewMoreReleases = doT.template(`<div class="row mt-3"><div class="button d-flex justify-content-center"><a role="button" class="btn btn-outline-info" id="{{= it.domId }}">View More</a></div></div>`)

let latestRelease = undefined;
let latestNightly = undefined;
let prevStableReleases = [];
let prevNightlies = [];
let passingPRs = [];

let numPagesPrevStable = 1;
let numPagesPrevNightlies = 1;
let numPagesPassingPrs = 1;

$('document').ready(async function () {
  const response = await fetch('http://localhost:3000/latestReleasesAndPullRequests');
  const releasesAndBuilds = await response.json();

  // Get the latest release
  // picking the second for testing purposes...change
  if ('stableReleases' in releasesAndBuilds && releasesAndBuilds.stableReleases.length > 0) {
    latestRelease = releasesAndBuilds.stableReleases[1];
  }

  if ('stableReleases' in releasesAndBuilds && releasesAndBuilds.stableReleases.length > 1) {
    prevStableReleases = releasesAndBuilds.stableReleases.slice(1);
  }

  if ('nightlyReleases' in releasesAndBuilds && releasesAndBuilds.nightlyReleases.length > 0) {
    latestNightly = releasesAndBuilds.nightlyReleases[0];
  }

  if ('nightlyReleases' in releasesAndBuilds && releasesAndBuilds.nightlyReleases.length > 1) {
    prevNightlies = releasesAndBuilds.nightlyReleases.slice(1);
  }

  if ('pullRequestBuilds' in releasesAndBuilds && releasesAndBuilds.pullRequestBuilds.length > 0) {
    passingPRs = releasesAndBuilds.pullRequestBuilds;
  }

  renderReleasesAndBuilds();
});

function renderReleasesAndBuilds() {
  // Render Latest Release
  if (latestRelease != undefined) {
    $('#latest-release-artifacts').html('');
    $('#latest-stable-ver').html(latestRelease.version);
    if (latestRelease.description != null) {
      $('#latest-stable-notes').html(marked(latestRelease.description));
    } else {
      $('#latest-stable-notes').remove();
    }
    $('#latest-release-artifacts').append(
      latestArtifactDropdown({
        assets: latestRelease.assets.Windows,
        name: "Windows",
        icon: "fab fa-windows"
      }) +
      latestArtifactDropdown({
        assets: latestRelease.assets.Linux,
        name: "Linux",
        icon: "fab fa-linux"
      }) +
      latestArtifactDropdown({
        assets: latestRelease.assets.MacOS,
        name: "MacOS",
        icon: "fab fa-apple"
      })
    );
  }

  // Render Previous Stable Releases
  $('#previous-stable-releases').html('');
  if (prevStableReleases.length <= 0) {
    $('#previous-stable-releases').append(emptyPreviousReleases());
  }
  let maxItems = numPagesPrevStable * 5;
  for (var i = 0; i < maxItems && i < prevStableReleases.length; i++) {
    let release = prevStableReleases[i];
    let templateData = {
      releaseName: release.version,
      releaseDate: new Date(release.publishedAt).toLocaleDateString(),
      platforms: [
        {
          assets: release.assets.Windows,
          name: "Windows",
          icon: "fab fa-windows"
        }, {
          assets: release.assets.Linux,
          name: "Linux",
          icon: "fab fa-linux"
        }, {
          assets: release.assets.MacOS,
          name: "MacOS",
          icon: "fab fa-apple"
        }],
      releaseNotes: release.description == undefined ? null : marked(release.description)
    }
    $('#previous-stable-releases').append(releaseRow(templateData));
  }
  if (prevStableReleases.length > maxItems) {
    $('#previous-stable-releases').append(viewMoreReleases({ domId: "view-more-stable" }));
  }

  // Render Nightly Releases
  $('#previous-nightly-builds').html('');
  $('#latest-nightly-ver').html(latestNightly.version);
  if (latestRelease.description != null) {
    $('#latest-nightly-notes').html(marked(latestNightly.description));
  } else {
    $('#latest-nightly-notes').remove();
  }
  $('#latest-nightly-artifacts').html('');
  $('#latest-nightly-artifacts').append(
    latestArtifactDropdown({
      assets: latestNightly.assets.Windows,
      name: "Windows",
      icon: "fab fa-windows"
    }) +
    latestArtifactDropdown({
      assets: latestNightly.assets.Linux,
      name: "Linux",
      icon: "fab fa-linux"
    }) +
    latestArtifactDropdown({
      assets: latestNightly.assets.MacOS,
      name: "MacOS",
      icon: "fab fa-apple"
    })
  );

  if (prevStableReleases.length <= 0) {
    $('#previous-stable-releases').append(emptyPreviousReleases());
  }
  maxItems = numPagesPrevNightlies * 5;
  for (var i = 0; i < maxItems && i < prevNightlies.length; i++) {
    let release = prevNightlies[i];
    let templateData = {
      releaseName: release.version,
      releaseDate: new Date(release.publishedAt).toLocaleDateString(),
      platforms: [
        {
          assets: release.assets.Windows,
          name: "Windows",
          icon: "fab fa-windows"
        }, {
          assets: release.assets.Linux,
          name: "Linux",
          icon: "fab fa-linux"
        }, {
          assets: release.assets.MacOS,
          name: "MacOS",
          icon: "fab fa-apple"
        }],
      releaseNotes: release.description == undefined ? null : marked(release.description)
    }
    $('#previous-nightly-builds').append(releaseRow(templateData));
  }
  if (prevNightlies.length > maxItems) {
    $('#previous-nightly-builds').append(viewMoreReleases({ domId: "view-more-nightlies" }));
  }

  // Pull Request Builds
  $('#pull-request-builds').html('');
  if (passingPRs.length <= 0) {
    $('#pull-request-builds').append(emptyPreviousReleases());
  }
  maxItems = numPagesPassingPrs * 5;
  for (var i = 0; i < maxItems && i < passingPRs.length; i++) {
    let pr = passingPRs[i];
    $('#pull-request-builds').append(pullRequestRow({
      title: pr.title,
      authorName: pr.githubUser,
      additions: pr.additions,
      deletions: pr.deletions,
      url: pr.link
    }));
  }
  if (passingPRs.length > maxItems) {
    $('#pull-request-builds').append(viewMoreReleases({ domId: "view-more-prs" }));
  }

  $("#view-more-prs").click(function () {
    if (numPagesPassingPrs * 5 < passingPRs.length) {
      numPagesPassingPrs++;
    }
    renderReleasesAndBuilds();
  });

  // Event Handlers
  $(".release-notes-toggle").click(function (elem) {
    $(elem.target).parent().parent().parent().find('.release-notes').first().toggle();
  });
  $("#view-more-stable").click(function () {
    if (numPagesPrevStable * 5 < prevStableReleases.length) {
      numPagesPrevStable++;
    }
    renderReleasesAndBuilds();
  });
  $("#view-more-nightlies").click(function () {
    if (numPagesPrevNightlies * 5 < prevNightlies.length) {
      numPagesPrevNightlies++;
    }
    renderReleasesAndBuilds();
  });
  $("#view-more-prs").click(function () {
    if (numPagesPassingPrs * 5 < passingPRs.length) {
      numPagesPassingPrs++;
    }
    renderReleasesAndBuilds();
  });
}
